// Cognito wiring, kept tiny and lazy.
//
// Auth is off unless VITE_AUTH_ENABLED === "true". When it is off, nothing from
// aws-amplify is ever loaded and every request goes out as a plain fetch.

export const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED === "true";

export const COGNITO = {
  userPoolId: "ap-east-1_In4wDJ1Oz",
  userPoolClientId: "2mkh4lvgmrrnmkkvqa1dg72tf0",
  domain: "finance-api-auth.auth.ap-east-1.amazoncognito.com",
};

let configured = false;

async function amplify() {
  if (typeof window === "undefined" || !AUTH_ENABLED) return null;
  const [{ Amplify }, auth] = await Promise.all([
    import("aws-amplify"),
    import("aws-amplify/auth"),
  ]);
  if (!configured) {
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: COGNITO.userPoolId,
          userPoolClientId: COGNITO.userPoolClientId,
          loginWith: { email: true },
          signUpVerificationMethod: "code",
        },
      },
    });
    configured = true;
  }
  return auth;
}

async function need() {
  const auth = await amplify();
  if (!auth) throw new Error("Sign-in is not enabled");
  return auth;
}

/** API Gateway's Cognito authorizer validates the ID token. */
export async function getAccessToken() {
  const auth = await amplify();
  if (!auth) return null;
  try {
    const session = await auth.fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const auth = await amplify();
  if (!auth) return null;
  try {
    return await auth.getCurrentUser();
  } catch {
    return null;
  }
}

export async function signIn(username, password) {
  const auth = await need();
  return auth.signIn({ username, password });
}

export async function signUp(email, password) {
  const auth = await need();
  return auth.signUp({ username: email, password, options: { userAttributes: { email } } });
}

export async function confirmSignUp(email, code) {
  const auth = await need();
  return auth.confirmSignUp({ username: email, confirmationCode: code });
}

export async function resendCode(email) {
  const auth = await need();
  return auth.resendSignUpCode({ username: email });
}

export async function signOut() {
  const auth = await amplify();
  if (!auth) return;
  await auth.signOut();
}
