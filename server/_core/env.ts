export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /*
   * Entrar com Google. Sem as três variáveis o botão nem aparece na tela: um
   * botão que leva a erro é pior do que não ter o botão.
   */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  publicUrl: process.env.PUBLIC_URL ?? "",
};

export function isGoogleLoginEnabled() {
  return Boolean(ENV.googleClientId && ENV.googleClientSecret && ENV.publicUrl);
}
