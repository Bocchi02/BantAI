export function registrationEnabledFromConfig(config) {
  return config?.public_registration_enabled === true;
}

export function emailDeliveryReadyFromConfig(config) {
  return config?.email_delivery_ready === true;
}

export function normalizeAuthPath(path, registrationEnabled) {
  if (path === "/register") return registrationEnabled ? path : "/login";
  return ["/login", "/verification-pending", "/verify-email", "/forgot-password", "/reset-password"].includes(path) ? path : "/login";
}

export function registrationPrompt(registrationEnabled) {
  return registrationEnabled
    ? "Create an account"
    : "Accounts are currently provisioned for authorized pilot users.";
}
