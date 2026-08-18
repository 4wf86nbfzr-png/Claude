import { safeStorage } from 'electron';
import { CredentialService, type SecretBox } from '../core/services/CredentialService.js';

/**
 * Secret box backed by the operating system keychain (Keychain on macOS,
 * DPAPI on Windows, libsecret on Linux). Falls back to the local AES box when
 * the OS does not offer encryption — the setup assistant shows which one is in
 * use, because the difference matters.
 */
class SafeStorageBox implements SecretBox {
  readonly name = 'Betriebssystem-Schlüsselbund';

  available(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  encrypt(plaintext: string): string {
    return `os1.${safeStorage.encryptString(plaintext).toString('base64')}`;
  }

  decrypt(ciphertext: string): string {
    if (!ciphertext.startsWith('os1.')) {
      throw new Error('Fremdes Geheimnis-Format');
    }
    return safeStorage.decryptString(Buffer.from(ciphertext.slice(4), 'base64'));
  }
}

export function createSecretBox(dataDir: string): SecretBox {
  const osBox = new SafeStorageBox();
  if (osBox.available()) return osBox;
  return CredentialService.localBoxFor(dataDir);
}
