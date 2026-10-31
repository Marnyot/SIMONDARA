import { buildApp } from './app.js';
import { loadConfig } from './config.js';

try {
  const config = loadConfig();
  const { app } = await buildApp(config);
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'Menghentikan SIMONDARA');
    try {
      await app.close();
    } catch {
      app.log.error('Shutdown gagal');
      process.exitCode = 1;
    }
  };
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    await app.close();
    throw err;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : 'Startup gagal');
  process.exitCode = 1;
}
