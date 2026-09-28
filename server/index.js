import { createApiServer } from './app.js';
import { createStore } from './store.js';

const port = Number(process.env.PORT ?? 8787);
const store = createStore();
const server = createApiServer({ store });

server.listen(port, () => {
  // The private data plane: NIP-98 auth + server-side authorization.
  console.log(`BitOS private API listening on http://localhost:${port}`);
});
