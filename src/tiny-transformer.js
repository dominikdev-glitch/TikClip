const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

function findPython() {
  if (process.env.TINY_LLM_PYTHON) return process.env.TINY_LLM_PYTHON;

  const localPython = path.join(
    __dirname,
    '..',
    '.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
  return fs.existsSync(localPython) ? localPython : 'python';
}

function createTinyTransformerClient({
  modelPath = path.resolve(__dirname, '../llm/tiny_transformer.pt'),
  pythonPath = findPython(),
  onError = () => {},
} = {}) {
  const workerPath = path.resolve(__dirname, '../llm/tiny_transformer.py');
  let worker = null;
  let nextId = 1;
  let unavailable = false;
  let reportedError = false;
  let closing = false;
  const pending = new Map();

  function reportError(error) {
    if (!reportedError) {
      reportedError = true;
      onError(error);
    }
  }

  function settlePending() {
    for (const resolve of pending.values()) resolve(null);
    pending.clear();
  }

  function startWorker() {
    if (worker) return worker;
    if (unavailable || !fs.existsSync(modelPath)) return null;

    try {
      worker = spawn(
        pythonPath,
        [workerPath, '--worker', '--model', modelPath],
        { cwd: path.dirname(workerPath), windowsHide: true },
      );
    } catch (error) {
      unavailable = true;
      reportError(error);
      return null;
    }

    const output = readline.createInterface({ input: worker.stdout });
    output.on('line', (line) => {
      try {
        const message = JSON.parse(line);
        const resolve = pending.get(message.id);
        if (resolve) {
          pending.delete(message.id);
          resolve(typeof message.reply === 'string' ? message.reply : null);
        }
      } catch (error) {
        reportError(error);
      }
    });

    worker.stderr.on('data', (chunk) => {
      reportError(new Error(chunk.toString().trim()));
    });
    worker.on('error', (error) => {
      unavailable = true;
      worker = null;
      reportError(error);
      settlePending();
    });
    worker.on('exit', (code) => {
      worker = null;
      unavailable = true;
      if (!closing && code !== 0) {
        reportError(new Error(`Transformer worker exited (${code})`));
      }
      settlePending();
    });
    return worker;
  }

  function reply(text) {
    const activeWorker = startWorker();
    if (!activeWorker) return Promise.resolve(null);

    const id = nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(null);
      }, 15000);
      timer.unref();
      pending.set(id, (value) => {
        clearTimeout(timer);
        resolve(value);
      });

      try {
        activeWorker.stdin.write(
          `${JSON.stringify({ id, text })}\n`,
          (error) => {
            if (error) {
              const settle = pending.get(id);
              pending.delete(id);
              if (settle) settle(null);
            }
          },
        );
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        reportError(error);
        resolve(null);
      }
    });
  }

  function close() {
    closing = true;
    if (worker) worker.kill();
  }

  return { reply, close };
}

module.exports = { createTinyTransformerClient };
