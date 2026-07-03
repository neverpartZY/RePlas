/**
 * Shared validation and sanitization helpers for 再塑通 backend.
 */

// ---- XSS sanitization --------------------------------------------------------

/**
 * Strip HTML tags from a string value.
 */
function sanitize(value) {
  if (typeof value !== 'string') return value;
  let str = value.replace(/<[^>]*>/g, '');
  // Fix 4: strip control characters (including null bytes) to prevent injection
  str = str.replace(/[\x00-\x1F\x7F]/g, '');
  return str;
}

/**
 * Sanitize all text fields on an object in-place.
 * Whitelist of field names to sanitize.
 */
const TEXT_FIELDS = ['name', 'location', 'specs', 'notes', 'title', 'material', 'form', 'phone', 'email', 'company'];

function sanitizeObject(obj) {
  for (const key of Object.keys(obj)) {
    if (TEXT_FIELDS.includes(key) && typeof obj[key] === 'string') {
      obj[key] = sanitize(obj[key]);
    }
  }
  return obj;
}

// ---- SQL injection pattern detection -----------------------------------------

// Fix 3: only block actual SQL injection patterns, not legitimate text like
// "备注;联系" or "PET--A". Removed bare `;` and `--` which appear in normal input.
const DANGEROUS_SQL_PATTERNS = /DROP\s+TABLE|DROP\s+DATABASE|DELETE\s+FROM\s+\w|INSERT\s+INTO\s+\w|UPDATE\s+\w+\s+SET/i;

/**
 * Check a string value for dangerous SQL patterns.
 * Returns true if the input is clean.
 */
function hasDangerousSQL(value) {
  if (typeof value !== 'string') return false;
  return DANGEROUS_SQL_PATTERNS.test(value);
}

/**
 * Scan all text fields in an object for SQL injection patterns.
 * Returns the first field name that fails, or null if all clean.
 */
function findSQLInjection(obj) {
  for (const key of Object.keys(obj)) {
    if (TEXT_FIELDS.includes(key) && typeof obj[key] === 'string') {
      if (hasDangerousSQL(obj[key])) return key;
    }
  }
  return null;
}

// ---- Length limits -----------------------------------------------------------

const LENGTH_LIMITS = {
  name: 100,
  location: 200,
  specs: 500,
  notes: 2000,
  phone: 20,
  email: 100,
  company: 200,
};

/**
 * Check all text fields against length limits.
 * Returns { field, limit } of the first violation, or null.
 */
function checkLengthLimits(obj) {
  for (const [field, limit] of Object.entries(LENGTH_LIMITS)) {
    if (typeof obj[field] === 'string' && obj[field].length > limit) {
      return { field, limit };
    }
  }
  return null;
}

// ---- Price / Quantity bounds -------------------------------------------------

const MAX_PRICE = 1000000;
const MAX_QUANTITY = 100000;

// ---- Email / Phone validation ------------------------------------------------

/**
 * Validate email format.
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return true; // optional field
  if (email.length === 0) return true;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Validate Chinese mainland mobile phone number (11-digit, starting with 1).
 */
function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const re = /^1[3-9]\d{9}$/;
  return re.test(phone);
}

// ---- Valid statuses for listings ---------------------------------------------

const VALID_LISTING_STATUSES = ['active', 'fulfilled', 'closed', 'cancelled'];

module.exports = {
  sanitize,
  sanitizeObject,
  hasDangerousSQL,
  findSQLInjection,
  checkLengthLimits,
  validateEmail,
  validatePhone,
  LENGTH_LIMITS,
  MAX_PRICE,
  MAX_QUANTITY,
  VALID_LISTING_STATUSES,
};
