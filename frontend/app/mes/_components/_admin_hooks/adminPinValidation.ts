export const ADMIN_PIN_MIN_LENGTH = 4;
export const ADMIN_PIN_MAX_LENGTH = 32;

export type AdminPinForm = {
  current_pin: string;
  new_pin: string;
  confirm_pin: string;
};

export function isAdminPinLengthValid(pin: string): boolean {
  return pin.length >= ADMIN_PIN_MIN_LENGTH && pin.length <= ADMIN_PIN_MAX_LENGTH;
}

export function getAdminPinLengthError(pin: string): string | undefined {
  if (pin.length === 0 || isAdminPinLengthValid(pin)) return undefined;
  return "PIN은 4~32자로 입력하세요.";
}
