import { hashPassword } from '../src/password.js';
// Read stdin rather than argv/environment, so passwords never enter shell history or ps.
if (process.stdin.isTTY) {
  process.stderr.write('Masukkan password (input disembunyikan): ');
  const stdin = process.stdin;
  stdin.setRawMode(true);
  let password = '';
  stdin.on('data', (chunk: Buffer) => {
    for (const char of chunk.toString()) {
      if (char === '\u0003') {
        stdin.setRawMode(false);
        process.exit(130);
      }
      if (char === '\r' || char === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        process.stderr.write('\n');
        if (password.length < 8) {
          process.stderr.write('Minimal 8 karakter\n');
          process.exitCode = 1;
        } else void hashPassword(password).then(console.log);
        return;
      }
      if (char === '\u007f') password = password.slice(0, -1);
      else password += char;
    }
  });
} else {
  let input = '';
  for await (const chunk of process.stdin) input += String(chunk);
  const password = input.replace(/\r?\n$/, '');
  if (password.length < 8) throw new Error('Minimal 8 karakter');
  console.log(await hashPassword(password));
}
