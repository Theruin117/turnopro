export const APP_NAME = 'TurnoPro';
export const SERVICE_VERSION = '0.1.0';

/** Nombre de la cookie httpOnly que transporta el refresh token opaco. */
export const REFRESH_COOKIE_NAME = 'turnopro_refresh';

/** Prefijo de claves Redis. Nunca mezclar claves entre organizaciones. */
export const CACHE_KEY_PREFIX = 'turnopro';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 48;
