import nodemailer from 'nodemailer';

import {
  SMTP_HOST,
  SMTP_PASSWORD,
  SMTP_PORT,
  SMTP_USER,
} from '../../config.mjs';

const SMTP_CONNECTION_TIMEOUT_MS = 15_000;
const SMTP_DNS_TIMEOUT_MS = 10_000;
const SMTP_GREETING_TIMEOUT_MS = 10_000;
const SMTP_SOCKET_TIMEOUT_MS = 20_000;

export function getSmtpTransportOptions() {
  return {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    requireTLS: SMTP_PORT === 587,
    dnsTimeout: SMTP_DNS_TIMEOUT_MS,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    tls: {
      servername: SMTP_HOST,
    },
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  };
}

export function createSmtpTransport() {
  return nodemailer.createTransport(getSmtpTransportOptions());
}

export function getSmtpPublicSettings() {
  const options = getSmtpTransportOptions();
  return {
    host: options.host,
    port: options.port,
    secure: options.secure,
    requireTLS: options.requireTLS,
  };
}
