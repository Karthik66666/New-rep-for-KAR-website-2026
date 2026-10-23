/* Durable workspace state and private media for the Vercel API. */
const resources = ['users','jobs','clients','projects','contacts','employees','applications'];
export const runtimeKeys = ['sessions','attempts','submissions','challengeAttempts','challenges'];
export const mediaNamePattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\.(?:png|jpg|webp)$/;

export function createEmptyState() {
  return {
    database:{version:2,admin:null,...Object.fromEntries(resources.map(key => [key,[]]))},
    runtime:Object.fromEntries(runtimeKeys.map(key => [key,[]]))
  };
}

function validateState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
      !state.database || typeof state.database !== 'object' || Array.isArray(state.database) ||
      !state.runtime || typeof state.runtime !== 'object' || Array.isArray(state.runtime) ||
      resources.some(key => !Array.isArray(state.database[key])) ||
      runtimeKeys.some(key => !Array.isArray(state.runtime[key]) || state.runtime[key].some(entry => !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string'))) {
    throw new Error('The cloud workspace state is invalid. Restore a valid backup before continuing.');
  }
  return state;
}

export function isEmptyWorkspace(state) {
  validateState(state);
  return state.database.admin == null && resources.every(key => state.database[key].length === 0) &&
    Object.keys(state.database).every(key => key === 'version' || key === 'admin' || resources.includes(key)) &&
    runtimeKeys.every(key => state.runtime[key].length === 0) && Object.keys(state.runtime).every(key => runtimeKeys.includes(key));
}

export function createCloudStore({
  environment=process.env,
  connectionString=environment.DATABASE_URL,
  namespace=environment.KAR_WORKSPACE || (environment.VERCEL_ENV === 'production' ? 'kar-production' : 'kar-preview'),
  clientFactory,
  blobApi
}={}) {
  if (typeof connectionString !== 'string' || !connectionString.trim()) throw new Error('Set DATABASE_URL to the PostgreSQL connection string before enabling cloud storage.');
  try {
    if (!['postgres:','postgresql:'].includes(new URL(connectionString).protocol)) throw new Error();
  } catch { throw new Error('DATABASE_URL must be a PostgreSQL connection string.'); }
  if (typeof namespace !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(namespace)) throw new Error('KAR_WORKSPACE must contain 1–80 letters, numbers, underscores or hyphens.');
  if (!blobApi && !environment.BLOB_READ_WRITE_TOKEN && !(environment.BLOB_STORE_ID && environment.VERCEL_OIDC_TOKEN)) {
    throw new Error('Connect a private Vercel Blob store: set BLOB_READ_WRITE_TOKEN, or BLOB_STORE_ID with Vercel OIDC credentials.');
  }
  const makeClient = clientFactory ?? (async config => {
    const {Client} = await import('pg');
    return new Client(config);
  });
  const loadBlob = async () => blobApi ?? import('@vercel/blob');
  // Leave OIDC token resolution/refresh to the SDK rather than capturing a rotating token.
  const blobCredentials = environment.BLOB_STORE_ID && environment.VERCEL_OIDC_TOKEN
    ? {storeId:environment.BLOB_STORE_ID}
    : environment.BLOB_READ_WRITE_TOKEN ? {token:environment.BLOB_READ_WRITE_TOKEN} : {};
  function mediaPath(name) {
    if (typeof name !== 'string' || !mediaNamePattern.test(name)) throw new Error('Invalid media filename.');
    return `${namespace}/media/${name}`;
  }

  return {
    namespace,
    async withState(callback) {
      if (typeof callback !== 'function') throw new TypeError('A workspace callback is required.');
      const client = await makeClient({connectionString,connectionTimeoutMillis:10000});
      let begun = false;
      try {
        await client.connect();
        await client.query('BEGIN'); begun = true;
        await client.query("SELECT set_config('lock_timeout',$1,true), set_config('statement_timeout',$2,true)",['10000','30000']);
        const table = await client.query('SELECT to_regclass($1) AS table_name',['kar_workspaces']);
        if (!table.rows[0]?.table_name) {
          // Concurrent first deployments must not race PostgreSQL's system catalog.
          await client.query('SELECT pg_advisory_xact_lock($1)',[1262572119]);
          await client.query('CREATE TABLE IF NOT EXISTS kar_workspaces (namespace text PRIMARY KEY, state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
        }
        await client.query('INSERT INTO kar_workspaces (namespace,state) VALUES ($1,$2::jsonb) ON CONFLICT (namespace) DO NOTHING',[namespace,JSON.stringify(createEmptyState())]);
        const result = await client.query('SELECT state FROM kar_workspaces WHERE namespace=$1 FOR UPDATE',[namespace]);
        if (result.rows.length !== 1) throw new Error('The cloud workspace could not be locked.');
        const state = validateState(typeof result.rows[0].state === 'string' ? JSON.parse(result.rows[0].state) : result.rows[0].state);
        const before = JSON.stringify(state);
        const value = await callback(state);
        validateState(state);
        const after = JSON.stringify(state);
        if (after !== before) await client.query('UPDATE kar_workspaces SET state=$2::jsonb, updated_at=now() WHERE namespace=$1',[namespace,after]);
        await client.query('COMMIT'); begun = false;
        return value;
      } catch (error) {
        if (begun) { try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure. */ } }
        throw error;
      } finally {
        // A cleanup failure must not report a committed enquiry as an unsuccessful save.
        try { await client.end(); } catch { /* The transaction result already determines success. */ }
      }
    },
    media:{
      async read(name) {
        const pathname = mediaPath(name), api = await loadBlob();
        const result = await api.get(pathname,{access:'private',useCache:false,...blobCredentials});
        if (result === null) throw Object.assign(new Error('Image not found.'),{code:'ENOENT'});
        if (result?.statusCode !== 200 || !result.stream) throw new Error('Private image storage returned an invalid response.');
        return Buffer.from(await new Response(result.stream).arrayBuffer());
      },
      async write(name,buffer) {
        const pathname = mediaPath(name);
        if (!Buffer.isBuffer(buffer)) throw new TypeError('Media content must be a Buffer.');
        const api = await loadBlob();
        const contentType = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        await api.put(pathname,buffer,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType,...blobCredentials});
      }
    }
  };
}
