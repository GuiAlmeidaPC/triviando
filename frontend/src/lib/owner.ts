const KEY = "triviando.ownerToken";
const USERNAME_KEY = "triviando.username";

export function getOwnerToken(): string {
  let t = localStorage.getItem(KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(KEY, t);
  }
  return t;
}

export function setOwnerToken(token: string) {
  localStorage.setItem(KEY, token);
}

// getUsername returns the signed-in host's username, or null if anonymous.
export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

// signIn stores the account's owner token + username after register/login.
export function signIn(username: string, ownerToken: string) {
  setOwnerToken(ownerToken);
  localStorage.setItem(USERNAME_KEY, username);
}

// signOut clears the account and reverts to a fresh anonymous owner token, so
// the previous account's quizzes are no longer accessible on this device.
export function signOut() {
  localStorage.removeItem(USERNAME_KEY);
  localStorage.setItem(KEY, crypto.randomUUID());
}
