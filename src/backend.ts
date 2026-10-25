import { mkdir } from 'node:fs/promises';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

export const backend = new Hono();
const rpName = 'Passkey Demo';
const sessionCookie = 'passkey_session';
const sessions = new Map<string, string>();

const dataDirectory = new URL('../data/', import.meta.url);
const dataFile = new URL('../data/users.json', import.meta.url);

type Passkey = {
  id: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransport[];
};

type User = {
  id: string;
  username: string;
  passkeys: Passkey[];
  registrationChallenge?: string;
  authenticationChallenge?: string;
};

type Database = { users: User[] };

const readDatabase = async (): Promise<Database> => {
  const file = Bun.file(dataFile);
  if (!(await file.exists())) return { users: [] };
  return file.json();
};

const writeDatabase = async (database: Database) => {
  await mkdir(dataDirectory, { recursive: true });
  await Bun.write(dataFile, JSON.stringify(database, null, 2));
};

const getWebAuthnConfig = (requestUrl: string) => {
  const url = new URL(requestUrl);
  return { origin: url.origin, rpID: url.hostname };
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

export const getAuthenticatedUsername = (c: Context) => {
  const sessionId = getCookie(c, sessionCookie);
  return sessionId ? sessions.get(sessionId) : undefined;
};

const createSession = (c: Context, username: string) => {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, username);
  setCookie(c, sessionCookie, sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
};

backend.get('/register/options', async (c) => {
  const username = c.req.query('username')?.trim();
  if (!username) {
    return c.json({ error: 'Username is required' }, 400);
  }

  const database = await readDatabase();
  let user = database.users.find((item) => item.username === username);

  if (!user) {
    user = { id: crypto.randomUUID(), username, passkeys: [] };
    database.users.push(user);
  } else if (user.passkeys.length > 0) {
    return c.json({ error: 'This user already has a passkey' }, 409);
  }

  const { rpID } = getWebAuthnConfig(c.req.url);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.username,
    userDisplayName: user.username,
    attestationType: 'none',
    excludeCredentials: user.passkeys.map((passkey) => ({
      id: passkey.id,
      transports: passkey.transports,
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
  });

  user.registrationChallenge = options.challenge;
  await writeDatabase(database);

  return c.json(options);
});

backend.post('/register/verify', async (c) => {
  const username = c.req.query('username')?.trim();
  if (!username) {
    return c.json({ error: 'Username is required' }, 400);
  }

  const database = await readDatabase();
  const user = database.users.find((item) => item.username === username);
  if (!user?.registrationChallenge) {
    return c.json({ error: 'Registration challenge not found' }, 400);
  }

  const expectedChallenge = user.registrationChallenge;
  delete user.registrationChallenge;

  try {
    const response = await c.req.json<RegistrationResponseJSON>();
    const { origin, rpID } = getWebAuthnConfig(c.req.url);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      user.passkeys.push({
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64'),
        counter: credential.counter,
        transports: credential.transports as AuthenticatorTransport[] | undefined,
      });
    }

    await writeDatabase(database);
    return c.json({ verified: verification.verified });
  } catch (error) {
    await writeDatabase(database);
    return c.json({ error: errorMessage(error) }, 400);
  }
});

backend.get('/authenticate/options', async (c) => {
  const username = c.req.query('username')?.trim();
  if (!username) {
    return c.json({ error: 'Username is required' }, 400);
  }

  const database = await readDatabase();
  const user = database.users.find((item) => item.username === username);
  if (!user || user.passkeys.length === 0) {
    return c.json({ error: 'Passkey is not registered for this user' }, 404);
  }

  const { rpID } = getWebAuthnConfig(c.req.url);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: user.passkeys.map((passkey) => ({
      id: passkey.id,
      transports: passkey.transports,
    })),
  });

  user.authenticationChallenge = options.challenge;
  await writeDatabase(database);
  return c.json(options);
});

backend.post('/authenticate/verify', async (c) => {
  const username = c.req.query('username')?.trim();
  if (!username) {
    return c.json({ error: 'Username is required' }, 400);
  }

  const database = await readDatabase();
  const user = database.users.find((item) => item.username === username);
  if (!user?.authenticationChallenge) {
    return c.json({ error: 'Authentication challenge not found' }, 400);
  }

  const expectedChallenge = user.authenticationChallenge;
  delete user.authenticationChallenge;

  try {
    const response = await c.req.json<AuthenticationResponseJSON>();
    const passkey = user.passkeys.find((item) => item.id === response.id);
    if (!passkey) throw new Error('Passkey not found');

    const { origin, rpID } = getWebAuthnConfig(c.req.url);
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64')),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });

    if (verification.verified) {
      passkey.counter = verification.authenticationInfo.newCounter;
      createSession(c, user.username);
    }

    await writeDatabase(database);
    return c.json({ verified: verification.verified });
  } catch (error) {
    await writeDatabase(database);
    return c.json({ error: errorMessage(error) }, 400);
  }
});

backend.post('/logout', (c) => {
  const sessionId = getCookie(c, sessionCookie);

  if (sessionId) {
    sessions.delete(sessionId);
  }
  deleteCookie(c, sessionCookie, { path: '/' });

  return c.redirect('/');
});
