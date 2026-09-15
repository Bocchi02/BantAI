export function registrationEnabledFromConfig(config) {
  return config?.public_registration_enabled === true;
}

export function normalizeAuthPath(path, registrationEnabled) {
  return registrationEnabled && path === "/register" ? "/register" : "/login";
}

export function registrationPrompt(registrationEnabled) {
  return registrationEnabled
    ? "Create an account"
    : "Accounts are currently provisioned for authorized pilot users.";
}
