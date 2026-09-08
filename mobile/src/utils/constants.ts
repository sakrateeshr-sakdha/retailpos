export const STORAGE_KEYS = {
  AUTH_TOKEN: 'retailpos_auth_token',
  USER_DATA: 'retailpos_user_data',
  SHOP_DATA: 'retailpos_shop_data',
  ADMIN_PIN_HASH: 'retailpos_admin_pin_hash',
  SERVER_URL: 'retailpos_server_url',
  PRINTER_MAC: 'retailpos_printer_mac',
  PRINTER_SIZE: 'retailpos_printer_size',
  HARDWARE_SCANNER_ENABLED: 'retailpos_hardware_scanner_enabled',
} as const;

// Default server URLs:
export const DEFAULT_SERVER_URL = 'https://sturdy-space-giggle-wr6695qr77g53g4p-5000.app.github.dev/api';
export const LOCALHOST_SERVER_URL = 'http://localhost:5000/api';
