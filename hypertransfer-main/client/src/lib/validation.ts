/**
 * Validation utilities for form inputs across HyperTransfer.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Email validation
export const validateEmail = (email: string): ValidationResult => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    return { valid: false, error: "Email is required" };
  }
  if (!emailRegex.test(email)) {
    return { valid: false, error: "Please enter a valid email address" };
  }
  return { valid: true };
};

// Password validation (min 8 chars, 1 uppercase, 1 number, 1 special char)
export const validatePassword = (password: string): ValidationResult => {
  if (!password) {
    return { valid: false, error: "Password is required" };
  }
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must contain an uppercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must contain a number" };
  }
  if (!/[!@#$%^&*]/.test(password)) {
    return { valid: false, error: "Password must contain a special character (!@#$%^&*)" };
  }
  return { valid: true };
};

// 2FA code validation (6 digits)
export const validate2FACode = (code: string): ValidationResult => {
  if (!code) {
    return { valid: false, error: "2FA code is required" };
  }
  if (!/^\d{6}$/.test(code)) {
    return { valid: false, error: "2FA code must be 6 digits" };
  }
  return { valid: true };
};

// Wallet address validation (basic check for common formats)
export const validateWalletAddress = (address: string, network?: string): ValidationResult => {
  if (!address) {
    return { valid: false, error: "Wallet address is required" };
  }

  // ERC-20/EVM addresses
  if (network === "ethereum" || network === "bsc" || network === "polygon") {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return { valid: false, error: "Invalid ERC-20 address format" };
    }
  }

  // Tron/TRC-20 addresses
  if (network === "tron") {
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
      return { valid: false, error: "Invalid Tron address format" };
    }
  }

  // Generic check: must be alphanumeric and reasonable length
  if (!/^[a-zA-Z0-9]{26,}$/.test(address.replace(/^0x/, ""))) {
    return { valid: false, error: "Invalid wallet address format" };
  }

  return { valid: true };
};

// Amount validation
export const validateAmount = (amount: string, min: number = 0.01, max: number = 1000000): ValidationResult => {
  if (!amount) {
    return { valid: false, error: "Amount is required" };
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount)) {
    return { valid: false, error: "Amount must be a valid number" };
  }

  if (numAmount < min) {
    return { valid: false, error: `Minimum amount is ${min}` };
  }

  if (numAmount > max) {
    return { valid: false, error: `Maximum amount is ${max}` };
  }

  return { valid: true };
};

// Full name validation
export const validateFullName = (name: string): ValidationResult => {
  if (!name) {
    return { valid: false, error: "Full name is required" };
  }
  if (name.length < 2) {
    return { valid: false, error: "Name must be at least 2 characters" };
  }
  if (!/^[a-zA-Z\s'-]+$/.test(name)) {
    return { valid: false, error: "Name can only contain letters, spaces, hyphens, and apostrophes" };
  }
  return { valid: true };
};

// Phone number validation (basic international format)
export const validatePhoneNumber = (phone: string): ValidationResult => {
  if (!phone) {
    return { valid: false, error: "Phone number is required" };
  }
  if (!/^\+?[1-9]\d{1,14}$/.test(phone.replace(/[\s\-()]/g, ""))) {
    return { valid: false, error: "Please enter a valid phone number" };
  }
  return { valid: true };
};

// ID number validation (flexible for different formats)
export const validateIDNumber = (id: string): ValidationResult => {
  if (!id) {
    return { valid: false, error: "ID number is required" };
  }
  if (id.length < 5) {
    return { valid: false, error: "ID number must be at least 5 characters" };
  }
  return { valid: true };
};

// Date of birth validation (must be 18+)
export const validateDateOfBirth = (dateString: string): ValidationResult => {
  if (!dateString) {
    return { valid: false, error: "Date of birth is required" };
  }

  const dob = new Date(dateString);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  if (age < 18) {
    return { valid: false, error: "You must be at least 18 years old" };
  }

  if (age > 150) {
    return { valid: false, error: "Please enter a valid date of birth" };
  }

  return { valid: true };
};
