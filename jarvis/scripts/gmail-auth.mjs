#!/usr/bin/env node
/**
 * One-off helper that turns a Google OAuth desktop client into a refresh token
 * for the Gmail transport.
 *
 * It runs a loopback HTTP server (the flow Google prescribes for desktop
 * applications), opens the consent page, exchanges the code and prints the
 * refresh token. Nothing is stored here — paste the token into the app under
 * „Einrichtung → Zugänge", where it is encrypted.
 */
import { createServer } from 'node:http';
import { createInterface } from 'node:readline/promises';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { stdin, stdout } from 'node:process';

const PORT = Number.parseInt(process.env.GMAIL_OAUTH_PORT ?? '8765', 10);
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth`;
const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'];

const rl = createInterface({ input: stdin, output: stdout });

console.log('\nGmail-Zugang einrichten');
console.log('=======================\n');
console.log('Voraussetzung: In der Google Cloud Console ein OAuth-Client vom Typ „Desktop"');
console.log(`mit der Weiterleitungs-URI ${REDIRECT_URI}\n`);

const clientId = process.env.GMAIL_CLIENT_ID ?? (await rl.question('Client-ID: ')).trim();
const clientSecret = process.env.GMAIL_CLIENT_SECRET ?? (await rl.question('Client-Secret: ')).trim();

if (!clientId || !clientSecret) {
  console.error('Client-ID und Client-Secret werden benötigt.');
  rl.close();
  process.exit(1);
}

// PKCE — required for desktop clients and protects the code in transit.
const verifier = randomBytes(48).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(16).toString('hex');

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES.join(' '));
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');
authUrl.searchParams.set('code_challenge', challenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
authUrl.searchParams.set('state', state);

const code = await new Promise((resolve, reject) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
    if (url.pathname !== '/oauth') {
      response.writeHead(404).end();
      return;
    }
    const received = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const returnedState = url.searchParams.get('state');

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#05060a;color:#f4f5f7;padding:60px">
       <h1 style="font-weight:400">${error ? 'Abgebrochen' : 'Fertig'}</h1>
       <p>${error ? `Google meldete: ${error}` : 'Sie können dieses Fenster schließen und zum Terminal zurückkehren.'}</p></body>`,
    );
    server.close();

    if (error) reject(new Error(error));
    else if (returnedState !== state) reject(new Error('State stimmt nicht überein — Abbruch.'));
    else if (!received) reject(new Error('Kein Code erhalten.'));
    else resolve(received);
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\nBitte im Browser bestätigen:\n${authUrl}\n`);
    openInBrowser(authUrl.toString());
  });
  server.on('error', reject);
});

const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  }),
});

const token = await tokenResponse.json();

if (!tokenResponse.ok || !token.refresh_token) {
  console.error('\n✕ Kein Refresh-Token erhalten.');
  console.error(JSON.stringify(token, null, 2));
  console.error(
    '\nHäufigste Ursache: Der Zugang wurde vorher schon einmal erteilt. Dann unter\n' +
      'https://myaccount.google.com/permissions den Zugriff entziehen und erneut ausführen.',
  );
  rl.close();
  process.exit(1);
}

console.log('\n✓ Refresh-Token erhalten.\n');
console.log('In der App unter „Einrichtung → Zugänge" eintragen:\n');
console.log(`  Gmail Client Secret : ${clientSecret}`);
console.log(`  Gmail Refresh Token : ${token.refresh_token}\n`);
console.log('Alternativ als Umgebungsvariablen:\n');
console.log(`  GMAIL_CLIENT_SECRET="${clientSecret}"`);
console.log(`  GMAIL_REFRESH_TOKEN="${token.refresh_token}"\n`);

rl.close();

function openInBrowser(url) {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(command, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    // Kein Browser erreichbar — die URL steht oben und kann kopiert werden.
  }
}
