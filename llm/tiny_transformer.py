import argparse
import json
import random
import re
import sys
from pathlib import Path

import torch
from torch import nn

BLOCK_SIZE = 64
EMBEDDING_SIZE = 64
HEADS = 4
LAYERS = 2
DEFAULT_MODEL_PATH = Path(__file__).with_name('tiny_transformer.pt')
TOKEN_PATTERN = re.compile(r"\n|[a-z0-9]+(?:'[a-z]+)?|[^\w\s]", re.IGNORECASE)


class TinyTransformerLM(nn.Module):
    def __init__(self, vocab_size, block_size=BLOCK_SIZE):
        super().__init__()
        self.block_size = block_size
        self.token_embedding = nn.Embedding(vocab_size, EMBEDDING_SIZE)
        self.position_embedding = nn.Embedding(block_size, EMBEDDING_SIZE)
        layer = nn.TransformerEncoderLayer(
            d_model=EMBEDDING_SIZE,
            nhead=HEADS,
            dim_feedforward=EMBEDDING_SIZE * 2,
            dropout=0.0,
            activation='gelu',
            batch_first=True,
            norm_first=True,
        )
        self.blocks = nn.TransformerEncoder(layer, num_layers=LAYERS, enable_nested_tensor=False)
        self.final_norm = nn.LayerNorm(EMBEDDING_SIZE)
        self.output = nn.Linear(EMBEDDING_SIZE, vocab_size, bias=False)
        self.output.weight = self.token_embedding.weight

    def forward(self, tokens):
        _, length = tokens.shape
        positions = torch.arange(length, device=tokens.device)
        hidden = self.token_embedding(tokens) + self.position_embedding(positions)
        mask = torch.triu(
            torch.ones(length, length, dtype=torch.bool, device=tokens.device), diagonal=1
        )
        hidden = self.blocks(hidden, mask=mask)
        return self.output(self.final_norm(hidden))


def build_demo_training_data():
    return [
        ('hello', 'Hi! How can I help you today?'),
        ('hey', 'Hey there! Send a message or a TikTok link whenever you are ready.'),
        ('how are you', 'I am doing well and ready to help.'),
        ('who are you', 'I am TikClip, a small local chatbot built into this Telegram bot.'),
        ('what can you do', 'I can help download TikTok videos, explain the bot, and answer simple chat questions.'),
        ('how do i download a video', 'Send a TikTok video link in this chat and I will fetch the video for you.'),
        ('download a tiktok', 'Paste the TikTok video URL here. I will send the available video back in chat.'),
        ('which links work', 'Use a TikTok video link, including a vm.tiktok.com or vt.tiktok.com short link.'),
        ('my link did not work', 'Check that the link points to a public TikTok video, then try sending it again.'),
        ('where is the watermark', 'The downloader requests a watermark-free video when the source service provides one.'),
        ('can you download private videos', 'No. I can only retrieve videos that the source service can access.'),
        ('how do i upload to youtube', 'Connect YouTube from the menu, then choose Upload to YouTube and send a TikTok link.'),
        ('are youtube uploads public', 'Uploads are set to private by default.'),
        ('how do i post to tiktok', 'Connect your TikTok account from the menu, then choose Upload to TikTok.'),
        ('why do i need to connect my account', 'The platform asks you to authorize the bot before it can publish on your behalf.'),
        ('can you post without permission', 'No. Publishing requires your account authorization and the platform may apply additional limits.'),
        ('what is a transformer', 'A transformer is a neural network that uses attention to process sequences of tokens.'),
        ('are you a large language model', 'No. I am a very small experimental model and my answers are limited to my training examples.'),
        ('do you learn from this conversation', 'This model does not update its weights from a chat. You can teach the bot a specific reply with teach me: question | answer.'),
        ('teach me a reply', 'Send teach me: your question | the reply you want, and the bot will remember that pair.'),
        ('how do i teach you', 'Use this format: teach me: question | answer. The bot stores the reply for your account.'),
        ('thanks', 'You are welcome!'),
        ('thank you', 'You are welcome. Send a TikTok link or ask me another question.'),
        ('goodbye', 'Goodbye! I will be here when you need help.'),
        ('i need help', 'Tell me what you are trying to do, or open the menu to download or upload a video.'),
        ('is my video stored', 'The bot processes the link to retrieve and send the video; avoid sending content you do not have permission to use.'),
        ('why is the bot slow', 'Downloads depend on the source service and Telegram. Please wait a moment and try again if it does not finish.'),
        ('can you answer anything', 'No. I am a small offline model, so I may not know much outside the examples I learned.'),
    ]


def make_training_text(examples):
    return ''.join(f'User: {question}\nBot: {answer}\n\n' for question, answer in examples)


def tokenize(text):
    return TOKEN_PATTERN.findall(text.lower())


def train(model_path=DEFAULT_MODEL_PATH, steps=1000, seed=17):
    random.seed(seed)
    torch.manual_seed(seed)
    text = make_training_text(build_demo_training_data())
    vocabulary = sorted(set(tokenize(text)))
    vocabulary.append('<unk>')
    token_to_id = {token: index for index, token in enumerate(vocabulary)}
    encoded = torch.tensor([token_to_id[token] for token in tokenize(text)], dtype=torch.long)
    model = TinyTransformerLM(len(vocabulary))
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001)
    losses = []
    batch_size = 16

    for step in range(steps):
        starts = torch.randint(0, len(encoded) - BLOCK_SIZE - 1, (batch_size,))
        inputs = torch.stack([encoded[start:start + BLOCK_SIZE] for start in starts])
        targets = torch.stack([encoded[start + 1:start + BLOCK_SIZE + 1] for start in starts])
        logits = model(inputs)
        loss = nn.functional.cross_entropy(logits.reshape(-1, len(vocabulary)), targets.reshape(-1))
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        losses.append(float(loss.detach()))

    model_path = Path(model_path)
    model_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            'state_dict': model.state_dict(),
            'vocabulary': vocabulary,
            'block_size': BLOCK_SIZE,
        },
        model_path,
    )
    return model, vocabulary, losses


def load_model(model_path=DEFAULT_MODEL_PATH):
    checkpoint = torch.load(model_path, map_location='cpu', weights_only=True)
    vocabulary = checkpoint['vocabulary']
    model = TinyTransformerLM(len(vocabulary), checkpoint['block_size'])
    model.load_state_dict(checkpoint['state_dict'])
    model.eval()
    return model, {token: index for index, token in enumerate(vocabulary)}, vocabulary


@torch.inference_mode()
def generate_reply(model, token_to_id, vocabulary, prompt, max_new_tokens=200):
    fallback_id = token_to_id['<unk>']
    prefix = f'User: {prompt}\nBot:'
    tokens = [token_to_id.get(token, fallback_id) for token in tokenize(prefix)]
    generated = []
    for _ in range(max_new_tokens):
        context = torch.tensor([tokens[-model.block_size:]], dtype=torch.long)
        logits = model(context)[0, -1]
        next_id = int(torch.argmax(logits))
        tokens.append(next_id)
        token = vocabulary[next_id]
        if token == '\n':
            break
        generated.append(token)

    reply = ''
    punctuation = {'.', ',', '!', '?', ':', ';', ')', ']', '%'}
    for token in generated:
        if not reply:
            reply = token
        elif token in punctuation or reply.endswith(('(', '[')):
            reply += token
        else:
            reply += f' {token}'
    return reply.strip()


def run_worker(model_path):
    model, token_to_id, vocabulary = load_model(model_path)
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            reply = generate_reply(model, token_to_id, vocabulary, str(request.get('text', '')))
            print(json.dumps({'id': request.get('id'), 'reply': reply}), flush=True)
        except Exception as error:
            print(json.dumps({'id': request.get('id'), 'error': str(error)}), flush=True)


def main():
    parser = argparse.ArgumentParser(description='Train and serve the compact local transformer.')
    parser.add_argument('--train', action='store_true', help='train and save the model')
    parser.add_argument('--worker', action='store_true', help='serve newline-delimited JSON requests')
    parser.add_argument('--model', type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument('--steps', type=int, default=1000)
    parser.add_argument('--prompt', default='hello')
    args = parser.parse_args()

    if args.train:
        model, vocabulary, losses = train(args.model, args.steps)
        parameter_count = sum(parameter.numel() for parameter in model.parameters())
        print(f'trained_steps={len(losses)}')
        print(f'parameters={parameter_count}')
        print(f'loss_start={losses[0]:.4f}')
        print(f'loss_end={sum(losses[-20:]) / min(20, len(losses)):.4f}')
        print(f'vocabulary_size={len(vocabulary)}')
        print(f'model={args.model}')
        return

    if args.worker:
        run_worker(args.model)
        return

    model, token_to_id, vocabulary = load_model(args.model)
    print(generate_reply(model, token_to_id, vocabulary, args.prompt))


if __name__ == '__main__':
    main()
