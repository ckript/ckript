import nodemailer from "nodemailer";
import { getOTPExpirySeconds } from "./otpHelper.js";
import mailFrom from "./mailFrom.js";
import { CONTACTS, signatureHtml, signatureText } from "./companyContacts.js";
import { htmlToPlainText } from "./htmlText.js";
import { escapeHtml } from "./escapeHtml.js";
import {
  AUTOMATED_NOTICE,
  button,
  code,
  facts,
  fineprint,
  fragment,
  heading,
  linkFallback,
  list,
  panel,
  paragraphs,
  renderMailDocument,
} from "./mailDocument.js";

let cachedTransporter = null;

const formatOtpValidityLabel = (seconds) => {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 300;

  if (safeSeconds % 60 === 0) {
    const minutes = safeSeconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  return `${safeSeconds} second${safeSeconds === 1 ? "" : "s"}`;
};

/**
 * Drop trailing slashes.
 *
 * A loop, not `/\/+$/`. That pattern is quadratic on "////…x": the engine matches the run of slashes
 * from every starting position, checks for end-of-string, fails because of the trailing character,
 * and backtracks through the whole run each time. This runs on a client-supplied base URL.
 */
const trimTrailingSlash = (value = "") => {
  const text = String(value || "").trim();
  let end = text.length;
  while (end > 0 && text[end - 1] === "/") end -= 1;
  return text.slice(0, end);
};

const normalizeClientBaseUrl = (value = "") => {
  const rawValue = trimTrailingSlash(value);
  if (!rawValue) return "";

  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }

  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(rawValue)) {
    return `http://${rawValue}`;
  }

  return `https://${rawValue}`;
};

const resolveClientBaseUrl = (overrideBaseUrl = "") => {
  const candidates = [
    overrideBaseUrl,
    process.env.PUBLIC_CLIENT_URL,
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    process.env.APP_URL,
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const normalized = normalizeClientBaseUrl(candidates[i]);
    if (normalized) {
      return normalized;
    }
  }

  return "http://localhost:5173";
};

const buildClientUrl = (path = "/", overrideBaseUrl = "") => {
  const baseUrl = resolveClientBaseUrl(overrideBaseUrl);
  const normalizedPath = `/${String(path || "/").replace(/^\/+/, "")}`;
  return `${baseUrl}${normalizedPath}`;
};

// Create reusable transporter
const createTransporter = () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  // For development, use ethereal.email or Gmail
  // For production, use a proper email service like SendGrid, AWS SES, etc.
  
  const emailUser = (process.env.EMAIL_USER || '').trim();
  // Gmail App Passwords are 16 characters and are DISPLAYED as four space-separated groups
  // ("abcd efgh ijkl mnop") for readability — but the actual password has NO spaces. If those
  // display spaces are pasted into .env, Gmail rejects auth with "535-5.7.8 BadCredentials". A plain
  // .trim() only strips the ends, so remove ALL internal whitespace here.
  const emailPassword = (process.env.EMAIL_PASSWORD || '').replace(/\s+/g, '');
  
  console.log('Email config - User:', emailUser ? 'Found' : 'Missing', 'Pass:', emailPassword ? 'Found' : 'Missing');
  
  if (!emailUser || !emailPassword) {
    console.error('Missing EMAIL_USER or EMAIL_PASSWORD in environment variables');
    console.error('Available env keys:', Object.keys(process.env).filter(k => k.includes('EMAIL')));
    throw new Error('EMAIL_USER and EMAIL_PASSWORD environment variables are required');
  }
  
  if (process.env.EMAIL_HOST && process.env.EMAIL_PORT) {
    // Production configuration
    cachedTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT),
      secure: process.env.EMAIL_SECURE === 'true',
      pool: true,
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
    });
    return cachedTransporter;
  } else {
    // Development fallback - use Gmail with enhanced settings
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
    return cachedTransporter;
  }
};

// Validate email configuration
const validateEmailConfig = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    throw new Error('Email configuration missing. Please set EMAIL_USER and EMAIL_PASSWORD environment variables.');
  }
};

// Send OTP email
export const sendOTPEmail = async (email, name, otp) => {
  try {
    // Validate email configuration
    validateEmailConfig();
    
    // Validate email format
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new Error('Invalid email address format');
    }
    
    console.log(`Sending OTP email to ${email}...`);
    const transporter = createTransporter();
    const otpValidityLabel = formatOtpValidityLabel(getOTPExpirySeconds());

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: 'Verify Your Email - ckript',
      html: renderMailDocument({
        title: "Verify your email",
        preheader: `Your verification code is ${otp}.`,
        notice: AUTOMATED_NOTICE,
        blocks: [
          heading({ eyebrow: "Welcome to Ckript", title: "Verify your email.", subtitle: "One code, and your account is yours." }),
          paragraphs(`Hi ${name},\n\nThank you for signing up with Ckript. To complete your registration, enter the code below where you signed up.`),
          code(otp, "Your verification code"),
          paragraphs(`This code expires in ${otpValidityLabel}.\n\nIf you didn't create an account with Ckript, you can safely ignore this email.`),
        ],
      }),
      text: `Hi ${name},\n\nThank you for signing up with ckript! Your verification code is: ${otp}\n\nThis code will expire in ${otpValidityLabel}.\n\nIf you didn't create an account with ckript, please ignore this email.\n\nBest regards,\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('OTP email sent successfully to:', email, 'MessageId:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending OTP email to', email, ':', error.message, { code: error.code, command: error.command, response: error.response });
    
    let errorMessage = error.message;
    if (error.code === 'EAUTH') {
      errorMessage = 'Email authentication failed. Invalid credentials.';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Failed to connect to email server.';
    } else if (error.responseCode === 550) {
      errorMessage = 'Invalid recipient email address.';
    }
    
    return { success: false, error: errorMessage };
  }
};

// Send password reset OTP email
export const sendPasswordResetOTPEmail = async (email, name, otp, validitySeconds) => {
  try {
    validateEmailConfig();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new Error('Invalid email address format');
    }

    console.log(`Sending password reset OTP email to ${email}...`);
    const transporter = createTransporter();
    const otpValidityLabel = formatOtpValidityLabel(validitySeconds || getOTPExpirySeconds());

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: 'Reset your ckript password',
      html: renderMailDocument({
        title: "Reset your Ckript password",
        preheader: `Your password reset code is ${otp}.`,
        notice: AUTOMATED_NOTICE,
        blocks: [
          heading({ eyebrow: "Account security", title: "Reset your password.", subtitle: "Use the code below to choose a new one." }),
          paragraphs(`Hi ${name || "there"},\n\nWe received a request to reset the password for your Ckript account. Enter this code to continue:`),
          code(otp, "Your password reset code"),
          paragraphs(`This code expires in ${otpValidityLabel}.`),
          panel({ eyebrow: "Didn't request this?", text: "You can safely ignore this email — your password will remain unchanged." }),
        ],
      }),
      text: `Hi ${name || 'there'},\n\nWe received a request to reset the password for your ckript account.\n\nYour password reset code is: ${otp}\n\nThis code will expire in ${otpValidityLabel}.\n\nIf you didn't request a password reset, ignore this email — your password will remain unchanged.\n\nBest regards,\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset OTP email sent successfully to:', email, 'MessageId:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset OTP email to', email, ':', error.message);
    return { success: false, error: error.message };
  }
};

// Send welcome email after verification
export const sendWelcomeEmail = async (email, name) => {
  try {
    console.log(`Sending welcome email to ${email}...`);
    const transporter = createTransporter();
    
    // Verify transporter connection
    await transporter.verify();
    console.log('Email service verified successfully');

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: 'Welcome to ckript!',
      html: renderMailDocument({
        title: "Welcome to Ckript",
        preheader: "Your email is verified. Here is where to begin.",
        blocks: [
          heading({ eyebrow: "You're in", title: "Welcome to Ckript.", subtitle: "Your email is verified, and your desk is ready." }),
          paragraphs(`Hi ${name},\n\nYou're now part of the Ckript community. Three good places to begin:`),
          list(["Complete your profile", "Upload your first script", "Connect with industry professionals"]),
          paragraphs("We're excited to have you on board."),
          button({ text: "Open your dashboard", url: buildClientUrl("/dashboard") }),
        ],
      }),
      text: `Hi ${name},\n\nYour email has been successfully verified! You're now part of the ckript community.\n\nWe're excited to have you on board!\n\nBest regards,\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent successfully:', info.messageId);
    return { success: true };
  } catch (error) {
    console.error('Error sending welcome email:', {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
    });
    return { success: false, error: error.message };
  }
};

export const sendInvestorWelcomeEmail = async (email, name) => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: 'Welcome to ckript — Your Gateway to Exceptional Scripts',
      html: renderMailDocument({
        title: "Welcome to Ckript",
        preheader: "Every masterpiece starts with a single line.",
        blocks: [
          heading({ eyebrow: "Industry access granted", title: "The screen is waiting.", subtitle: "Every masterpiece starts with a single line. Your next big project is hiding in plain sight." }),
          paragraphs(`Hi ${name},\n\nWelcome to Ckript. You now have exclusive access to a curated marketplace of production-ready stories, brilliant writers, and untapped intellectual property. No middlemen. Just you and the script.`),
          button({ text: "Discover scripts", url: buildClientUrl("/search") }),
          fineprint("If you have any questions, reply to this email. We're here to help."),
        ],
      }),
      text: `Hi ${name},\n\nEvery masterpiece starts with a single line. Your next big project is hiding in plain sight.\n\nWelcome to ckript. You now have exclusive access to a curated marketplace of production-ready stories, brilliant writers, and untapped intellectual property. No middlemen. Just you and the script.\n\nDiscover Scripts: ${buildClientUrl('/search')}\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Investor welcome email sent:', info.messageId);
    return { success: true };
  } catch (error) {
    console.error('Error sending investor welcome email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send investor account approval email
export const sendInvestorApprovalEmail = async (email, name, options = {}) => {
  try {
    console.log(`Sending investor approval email to ${email}...`);
    const transporter = createTransporter();
    await transporter.verify();

    const loginUrl = buildClientUrl("/login", options?.clientBaseUrl || "");

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: '✅ Your Investor Account Has Been Approved — ckript',
      html: renderMailDocument({
        title: "Your investor account is approved",
        preheader: "Your investor account has been reviewed and approved.",
        notice: AUTOMATED_NOTICE,
        blocks: [
          heading({ eyebrow: "Account approved", title: "You're approved.", subtitle: "Your investor account has been reviewed and approved by our team." }),
          paragraphs(`Hi ${name},\n\nGreat news. You can now log in and start exploring investment opportunities in creative projects.`),
          button({ text: "Log in to Ckript", url: loginUrl }),
          linkFallback(loginUrl),
          paragraphs("Welcome aboard."),
        ],
      }),
      text: `Hi ${name},\n\nGreat news! Your investor account on ckript has been approved.\n\nYou can now log in at: ${loginUrl}\n\nWelcome aboard,\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Investor approval email sent to:', email, 'MessageId:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending investor approval email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send investor account rejection email with optional admin reason
export const sendInvestorRejectionEmail = async (email, name, reason, options = {}) => {
  try {
    console.log(`Sending investor rejection email to ${email}...`);
    const transporter = createTransporter();
    await transporter.verify();

    const loginUrl = buildClientUrl("/login", options?.clientBaseUrl || "");
    const safeReason = String(reason || "").trim();

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: 'Update on Your Investor Profile Review — ckript',
      html: renderMailDocument({
        title: "Update on your investor profile review",
        preheader: "After review, your profile was not approved at this time.",
        notice: AUTOMATED_NOTICE,
        blocks: [
          heading({ eyebrow: "Profile review", title: "Profile review update.", subtitle: "Your investor profile was not approved at this time." }),
          paragraphs(`Hi ${name},\n\nThank you for applying as an investor on Ckript. After review, your profile was not approved at this time.`),
          safeReason ? panel({ eyebrow: "Review reason", text: safeReason }) : "",
          paragraphs("You may update your profile details and contact our support team for guidance."),
          button({ text: "Open Ckript login", url: loginUrl }),
          fineprint(`Need help? Reach us at ${CONTACTS.support}`),
        ],
      }),
      text: `Hi ${name},\n\nYour investor profile was not approved at this time.${safeReason ? `\n\nReview reason: ${safeReason}` : ""}\n\nYou can contact support at ${CONTACTS.support}.\n\nLogin: ${loginUrl}\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Investor rejection email sent to:', email, 'MessageId:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending investor rejection email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send writer membership decision email
export const sendWriterMembershipDecisionEmail = async (
  email,
  name,
  membershipLabel,
  decision,
  note = "",
  options = {}
) => {
  try {
    console.log(`Sending ${membershipLabel} membership ${decision} email to ${email}...`);
    const transporter = createTransporter();
    await transporter.verify();

    const normalizedDecision = String(decision || "").toLowerCase() === "approved" ? "approved" : "rejected";
    const safeMembershipLabel = String(membershipLabel || "Membership").toUpperCase();
    const safeNote = String(note || "").trim();
    const profileUrl = buildClientUrl("/profile", options?.clientBaseUrl || "");
    const isApproved = normalizedDecision === "approved";
    const subject = isApproved
      ? `✅ ${safeMembershipLabel} Membership Approved — ckript`
      : `Update on Your ${safeMembershipLabel} Membership Review — ckript`;

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject,
      html: renderMailDocument({
        title: `${safeMembershipLabel} membership review`,
        preheader: isApproved ? "Your membership request has been approved." : "Your membership request has been reviewed.",
        notice: AUTOMATED_NOTICE,
        blocks: [
          heading({
            eyebrow: isApproved ? "Membership approved" : "Membership not approved",
            title: `${safeMembershipLabel} membership review.`,
            subtitle: isApproved
              ? "Your writer profile now reflects your verified membership status."
              : "Your request was not approved at this time. You can upload updated proof and submit again.",
          }),
          paragraphs(`Hi ${name},\n\nYour ${safeMembershipLabel} membership request has been ${isApproved ? "approved" : "reviewed"}.`),
          safeNote ? panel({ eyebrow: "Admin note", text: safeNote }) : "",
          button({ text: "Open my profile", url: profileUrl }),
          linkFallback(profileUrl),
        ],
      }),
      text: `Hi ${name},\n\nYour ${safeMembershipLabel} membership request has been ${isApproved ? "approved" : "reviewed"}.${safeNote ? `\n\nAdmin note: ${safeNote}` : ""}\n\nOpen profile: ${profileUrl}\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Writer membership decision email sent to ${email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending writer membership decision email:", error.message);
    return { success: false, error: error.message };
  }
};

// Send purchase request email to writer
export const sendPurchaseRequestEmail = async (
  writerEmail,
  writerName,
  requesterName,
  requesterType,
  scriptTitle,
  amount,
  requestNote = "",
  options = {}
) => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    const safeRequesterName = String(requesterName || "A buyer").trim();
    const safeRequesterType = String(requesterType || "Buyer").trim();
    const safeRequestNote = String(requestNote || "").trim();

    const dashboardUrl = buildClientUrl("/purchase-requests", options?.clientBaseUrl || "");

    const mailOptions = {
      from: mailFrom(),
      to: writerEmail,
      subject: `📩 ${safeRequesterType} Access Request for "${scriptTitle}" — ckript`,
      html: renderMailDocument({
        title: "New purchase request",
        preheader: `${safeRequesterName} wants access to "${scriptTitle}".`,
        notice: AUTOMATED_NOTICE,
        blocks: [
          heading({ eyebrow: "Purchase request", title: "Someone wants your script.", subtitle: `${safeRequesterName} (${safeRequesterType}) has sent a purchase request for “${scriptTitle}”.` }),
          paragraphs(`Hi ${writerName},`),
          facts([["Script", scriptTitle], ["Offered amount", `₹${amount}`], ["Requester", `${safeRequesterName} (${safeRequesterType})`], ["Message", safeRequestNote]]),
          paragraphs("Log in to Ckript and review this request in your purchase requests panel.\n\nTo share the full script, approve the request from the dashboard. If you decline, access will not be granted. If you approve, the buyer will be asked to complete payment before access is granted."),
          button({ text: "Review purchase request", url: dashboardUrl }),
          linkFallback(dashboardUrl),
        ],
      }),
      text: `Hi ${writerName},\n\n${safeRequesterName} (${safeRequesterType}) wants access to your script "${scriptTitle}" and has sent a purchase request for ₹${amount}.${safeRequestNote ? `\n\nMessage: ${safeRequestNote}` : ""}\n\nPlease review the request on ckript and approve from the dashboard. After approval, the buyer will be asked to pay before access is granted.\n\nReview request: ${dashboardUrl}\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending purchase request email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send purchase approved email to investor
export const sendPurchaseApprovedEmail = async (investorEmail, investorName, writerName, scriptTitle, scriptId = "", options = {}) => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    const requiresPayment = Boolean(options?.requiresPayment);
    const amount = Number(options?.amount || 0);
    const paymentDueAtRaw = options?.paymentDueAt;
    const paymentDueAt = paymentDueAtRaw ? new Date(paymentDueAtRaw) : null;
    const deadlineText = paymentDueAt && !Number.isNaN(paymentDueAt.getTime())
      ? paymentDueAt.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
      : "";
    const scriptsUrl = buildClientUrl(scriptId ? `/script/${scriptId}` : "/search", options?.clientBaseUrl || "");
    const subject = requiresPayment
      ? `✅ Request Approved — Complete Payment for "${scriptTitle}" — ckript`
      : `✅ Purchase Approved — "${scriptTitle}" — ckript`;
    const headerTitle = requiresPayment ? "Request approved" : "Purchase approved";
    const badgeText = requiresPayment ? "Approved · Payment required" : "Approved";
    const statusText = requiresPayment ? "Awaiting buyer payment" : "Access granted";
    const ctaLabel = requiresPayment ? "Pay & Unlock Script" : "Open Approved Script";
    const bodyIntro = requiresPayment
      ? `Great news! <strong>${escapeHtml(writerName)}</strong> approved your purchase request. Complete the payment to unlock full script access.`
      : `Great news! <strong>${escapeHtml(writerName)}</strong> has approved your purchase request. You now have full access to the script.`;
    const bodyDetails = requiresPayment
      ? `<p>Please complete payment${amount > 0 ? ` of <strong>₹${amount.toLocaleString("en-IN")}</strong>` : ""} from the script page to unlock full synopsis and content.</p>${deadlineText ? `<p><strong>Payment deadline:</strong> ${deadlineText}</p>` : ""}`
      : `<p>You can now view the complete synopsis, full content, and all script details on ckript.</p>`;
    const textVersion = requiresPayment
      ? `Hi ${investorName},\n\n${writerName} approved your purchase request for "${scriptTitle}". Please complete payment${amount > 0 ? ` of ₹${amount.toLocaleString("en-IN")}` : ""} to unlock full access.${deadlineText ? `\nPayment deadline: ${deadlineText}` : ""}\n\nContinue: ${scriptsUrl}\n\nTeam ${CONTACTS.name}${signatureText()}`
      : `Hi ${investorName},\n\n${writerName} has approved your purchase request for "${scriptTitle}". You now have full access.\n\nOpen script: ${scriptsUrl}\n\nTeam ${CONTACTS.name}${signatureText()}`;

    const mailOptions = {
      from: mailFrom(),
      to: investorEmail,
      subject,
      html: renderMailDocument({
        title: headerTitle,
        preheader: requiresPayment
          ? `${writerName} approved your request. Complete the payment to unlock the script.`
          : `${writerName} approved your request. You now have full access.`,
        notice: AUTOMATED_NOTICE,
        blocks: [
          heading({
            eyebrow: badgeText,
            title: `${headerTitle}.`,
            subtitle: requiresPayment ? `Complete the payment to unlock “${scriptTitle}”.` : `You now have full access to “${scriptTitle}”.`,
          }),
          fragment(`<p>Hi <strong>${escapeHtml(investorName)}</strong>,</p><p>${bodyIntro}</p>${bodyDetails}`),
          facts([["Script", scriptTitle], ["Writer", writerName], ["Status", statusText]]),
          button({ text: ctaLabel, url: scriptsUrl }),
          paragraphs(requiresPayment ? "Once payment is confirmed, access is granted instantly." : "Congratulations on your acquisition."),
        ],
      }),
      text: textVersion,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending purchase approved email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send purchase rejected email to investor
export const sendPurchaseRejectedEmail = async (investorEmail, investorName, writerName, scriptTitle, note, options = {}) => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    const refundAmount = Number(options?.refundAmount || 0);
    const searchUrl = buildClientUrl("/search", options?.clientBaseUrl || "");

    const mailOptions = {
      from: mailFrom(),
      to: investorEmail,
      subject: `Purchase Request Declined — "${scriptTitle}" — ckript`,
      html: renderMailDocument({
        title: "Purchase request update",
        preheader: `${writerName} has declined your purchase request for "${scriptTitle}".`,
        notice: AUTOMATED_NOTICE,
        blocks: [
          heading({ eyebrow: "Request declined", title: "Purchase request update.", subtitle: `${writerName} has declined your purchase request for “${scriptTitle}”.` }),
          paragraphs(`Hi ${investorName},\n\nWe're sorry to inform you that ${writerName} has declined your purchase request for the following script.`),
          facts([["Script", scriptTitle], ["Writer", writerName], ["Status", "Declined"]]),
          note ? panel({ eyebrow: "Writer's note", text: String(note) }) : "",
          paragraphs(refundAmount > 0
            ? `Any funds reserved for this request have been refunded (₹${refundAmount.toLocaleString("en-IN")}).`
            : "No payment was collected for this request."),
          paragraphs("Don't be discouraged — there are many other great scripts on Ckript."),
          button({ text: "Explore more scripts", url: searchUrl }),
        ],
      }),
      text: `Hi ${investorName},\n\n${writerName} has declined your purchase request for "${scriptTitle}".\n${note ? `\nWriter's note: ${note}\n` : ''}\n${refundAmount > 0 ? `Any reserved funds were refunded${refundAmount ? ` (₹${refundAmount.toLocaleString("en-IN")})` : ""}.` : "No payment was collected for this request."}\n\nExplore more scripts: ${searchUrl}\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending purchase rejected email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send admin workflow alert email to company mailbox
export const sendAdminWorkflowAlertEmail = async ({ title, section, message, metadata = {} }) => {
  try {
    validateEmailConfig();

    const transporter = createTransporter();
    await transporter.verify();

    const companyEmail = (process.env.COMPANY_NOTIFICATION_EMAIL || CONTACTS.company).trim().toLowerCase();
    if (!companyEmail || !companyEmail.includes("@")) {
      return { success: false, error: "Invalid company notification email" };
    }

    // Whether the alerts below are being posted to the company's own inbox — the two suppression
    // rules underneath apply there and nowhere else.
    const isCompanyInbox = companyEmail === CONTACTS.company.trim().toLowerCase();

    const safeTitle = String(title || "Admin Workflow Alert").trim();
    const safeSection = String(section || "admin").trim();
    const safeMessage = String(message || "A new admin workflow item was created.").trim();
    const combinedAlertText = `${safeTitle} ${safeMessage}`.toLowerCase();
    const normalizedSection = safeSection.toLowerCase();
    const trailerRelated =
      normalizedSection.includes("trailer") ||
      combinedAlertText.includes("trailer");
    const projectSpotlightActivatedRelated =
      combinedAlertText.includes("project spotlight activated");

    // Do not send trailer-related alerts to the company inbox alias requested by the user.
    if (isCompanyInbox && trailerRelated) {
      return { success: true, skipped: true, reason: "trailer-alert-blocked-for-company-email" };
    }

    if (isCompanyInbox && projectSpotlightActivatedRelated) {
      return { success: true, skipped: true, reason: "spotlight-activation-alert-blocked-for-company-email" };
    }


    const mailOptions = {
      from: mailFrom(),
      to: companyEmail,
      subject: `[Admin Alert] ${safeTitle}`,
      html: renderMailDocument({
        title: `[Admin Alert] ${safeTitle}`,
        preheader: safeMessage,
        blocks: [
          heading({ eyebrow: `Admin alert · ${safeSection}`, title: safeTitle }),
          paragraphs(safeMessage),
          facts(Object.entries(metadata || {}).map(([key, value]) => [String(key), value === undefined || value === null ? "" : String(value)])),
          fineprint(`Generated at ${new Date().toISOString()}`),
        ],
      }),
      text: `Title: ${safeTitle}\nSection: ${safeSection}\nMessage: ${safeMessage}\n${Object.entries(metadata || {}).map(([k, v]) => `${k}: ${v}`).join("\n")}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending admin workflow alert email:", error.message);
    return { success: false, error: error.message };
  }
};

export const sendAdminPremiumGrantedEmail = async (
  email,
  name,
  { adminName = "Admin", clientBaseUrl = "" } = {}
) => {
  try {
    validateEmailConfig();

    const transporter = createTransporter();

    const safeAdminName = String(adminName || "Admin").trim() || "Admin";
    const dashboardUrl = buildClientUrl("/dashboard", clientBaseUrl);

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: "Welcome to ckript Premium!",
      html: renderMailDocument({
        title: "Welcome to Ckript Premium",
        preheader: `${safeAdminName} has granted you full access to the Ckript Premium Model.`,
        blocks: [
          heading({ eyebrow: "Premium model activated", title: "Welcome to Ckript Premium.", subtitle: `${safeAdminName} has granted you full access to the Premium Model for film industry professionals.` }),
          paragraphs(`Hi ${name || "there"},\n\nWith Premium, you can now:`),
          list([
            "Explore a curated library of high-quality scripts.",
            "View comprehensive writer details and portfolios.",
            "Access exclusive AI evaluation scores and tools.",
            "Connect directly with emerging and established writers.",
          ]),
          button({ text: "Explore Ckript Premium", url: dashboardUrl }),
          fineprint("Thank you for being part of the Ckript community."),
        ],
      }),
      text: `Hi ${name || "there"},\n\nWe have great news! ${safeAdminName} has granted you full access to the ckript Premium Model.\n\nWith Premium, you can explore high-quality scripts, view writer details, and access exclusive AI tools.\n\nExplore ckript Premium: ${dashboardUrl}\n\nThank you for being part of the ckript community.\n\nRegards,\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending admin premium grant email:", error.message);
    return { success: false, error: error.message };
  }
};

export const sendAdminPremiumRemovedEmail = async (
  email,
  name,
  { adminName = "Admin", clientBaseUrl = "" } = {}
) => {
  try {
    validateEmailConfig();

    const transporter = createTransporter();

    const safeAdminName = String(adminName || "Admin").trim() || "Admin";
    const contactUrl = buildClientUrl("/contact", clientBaseUrl);

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: "Update Regarding Your ckript Premium Access",
      html: renderMailDocument({
        title: "Update regarding your Ckript Premium access",
        preheader: "Your Premium Model access has been removed.",
        blocks: [
          heading({ eyebrow: "Premium access", title: "Premium Model access removed.", subtitle: "Your account has been returned to the standard tier." }),
          paragraphs(`Hi ${name || "there"},\n\nWe are writing to inform you that ${safeAdminName} has removed your access to the Ckript Premium Model.\n\nAs a result, your account has been reverted to the standard tier, and premium features (such as comprehensive writer details and exclusive AI evaluation tools) are no longer active on your account.\n\nIf you believe this was a mistake, or if you have any questions, please reach out to our support team.`),
          button({ text: "Contact support", url: contactUrl }),
          fineprint("Thank you for being part of the Ckript community."),
        ],
      }),
      text: `Hi ${name || "there"},\n\nWe are writing to inform you that ${safeAdminName} has removed your access to the ckript Premium Model.\n\nYour account has been reverted to the standard tier. If you have any questions, please reach out to our support team.\n\nContact Support: ${contactUrl}\n\nThank you for being part of the ckript community.\n\nRegards,\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending admin premium remove email:", error.message);
    return { success: false, error: error.message };
  }
};

// Send user email when admin sends a direct message
export const sendAdminMessageEmail = async (
  email,
  name,
  { senderName = "Admin", previewText = "", hasAttachment = false, clientBaseUrl = "" } = {}
) => {
  try {
    validateEmailConfig();

    const transporter = createTransporter();

    const safeSenderName = String(senderName || "Admin").trim() || "Admin";
    const safePreview = String(previewText || "").trim();
    const messagesUrl = buildClientUrl("/messages", clientBaseUrl);
    const summary = safePreview
      ? safePreview
      : hasAttachment
        ? "You have a new attachment from admin."
        : "You have a new message from admin.";

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: "New admin message on ckript",
      html: renderMailDocument({
        title: "New admin message on Ckript",
        preheader: summary,
        blocks: [
          heading({ eyebrow: "Message from the team", title: "New admin message.", subtitle: `${safeSenderName} sent you a message on Ckript.` }),
          paragraphs(`Hi ${name || "there"},`),
          panel({ eyebrow: "Preview", text: summary }),
          button({ text: "Open messages", url: messagesUrl }),
          fineprint("This is an automated email from Ckript."),
        ],
      }),
      text: `Hi ${name || "there"},\n\n${safeSenderName} sent you a new message on ckript.\nPreview: ${summary}\n\nOpen messages: ${messagesUrl}\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending admin message email:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * The Email Builder's compiled footer carries these two slots, filled here per recipient — the
 * unsubscribe token is theirs, so the link cannot exist until the recipient is known. Literal for
 * literal the same as UNSUBSCRIBE_SLOT / PREFERENCES_SLOT in
 * client/src/pages/admin/marketing/compiler/emailCompiler.js; emailBuilderPreview.test.jsx pins the
 * two sides to each other across the package boundary.
 */
const UNSUBSCRIBE_SLOT = "{{UNSUBSCRIBE_URL}}";
const PREFERENCES_SLOT = "{{PREFERENCES_URL}}";

export const sendAdminBroadcastEmail = async (
  email,
  name,
  { title = "Platform update", content = "", actionUrl = "", audienceLabel = "community", adminName = "ckript Admin", clientBaseUrl = "", attachments = [], unsubscribeUrl = "" } = {}
) => {
  try {
    validateEmailConfig();

    const transporter = createTransporter();
    const safeTitle = String(title || "Platform update").trim() || "Platform update";
    const safeContent = String(content || "").trim();
    const safeAudienceLabel = String(audienceLabel || "community").trim() || "community";
    const safeAdminName = String(adminName || "ckript Admin").trim() || "ckript Admin";
    const dashboardUrl = buildClientUrl("/dashboard", clientBaseUrl);
    // Where "Preferences" goes: the email-notification toggles on the profile's Settings tab. A
    // CLIENT link, unlike the unsubscribe one — that endpoint lives on the API, this page lives in
    // the SPA — so it goes through buildClientUrl like the dashboard link, not the API origin.
    const preferencesUrl = buildClientUrl("/profile?tab=settings", clientBaseUrl);
    const finalUrl = actionUrl || dashboardUrl;
    const buttonText = actionUrl ? "Open Link" : "Open ckript";
    // No extra replacements needed if content is already HTML, but let's safely allow basic line breaks if it's plain text.
    // If the frontend sends HTML (Tiptap), it shouldn't be blindly replaced, but we will trust the admin input.
    const isHtml = /<[a-z][\s\S]*>/i.test(safeContent);
    const htmlContent = isHtml ? safeContent : safeContent.replace(/\n/g, '<br/>');
    
    // Check if the content is from the new Email Builder V2 (which includes its own wrapper)
    const isBuilderV2 = htmlContent.includes("<!-- EMAIL_BUILDER_V2 -->");

    const finalHtml = isBuilderV2 ? htmlContent : `
        <!DOCTYPE html>
        <html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta name="x-apple-disable-message-reformatting">
          <meta name="color-scheme" content="light dark">
          <meta name="supported-color-schemes" content="light dark">
          <title>${safeTitle}</title>
          <!--[if !mso]><!-->
          <link href="https://fonts.googleapis.com/css2?family=Baskervville:ital@0;1&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" type="text/css">
          <!--<![endif]-->
          <style>
            /* The same shell the Email Builder compiles (client/src/pages/admin/marketing/compiler/emailCompiler.js):
               warm paper, ink, one coral accent, serif display type. Palette pinned across packages by
               emailBuilderPreview.test.jsx — a colour that is not in EMAIL_PALETTE there fails the build. */
            body { margin: 0; padding: 0; width: 100%; background-color: #fbfaf7; -webkit-text-size-adjust: 100%; }
            table { border-collapse: collapse; border-spacing: 0; }
            img { border: 0; display: block; }
            .card { width: 100%; max-width: 640px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e7e5df; border-radius: 16px; }
            .masthead { padding: 32px 48px 26px; border-bottom: 1px solid #f2efe9; text-align: center; }
            .masthead img { width: 280px; max-width: 70%; height: auto; margin: 0 auto; }
            .title { margin: 0 0 22px; font-family: 'Baskervville', 'Spectral', Georgia, 'Times New Roman', serif; font-size: 32px; font-weight: 400; line-height: 1.2; letter-spacing: -0.3px; color: #0b0a06; text-align: center; }
            .body { padding: 40px 48px 8px; font-family: 'PT Serif', Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.75; color: #57544f; }
            .body p { margin: 0 0 18px; }
            .body a { color: #0b0a06; }
            .cta-cell { padding: 20px 48px 44px; text-align: center; }
            .action-btn { display: inline-block; background-color: #161513; color: #ffffff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; letter-spacing: 0.2px; line-height: 50px; padding: 0 36px; border-radius: 10px; text-decoration: none; }
            .footer { padding: 34px 48px 38px; background-color: #f4efe6; border-top: 1px solid #e7e5df; border-radius: 0 0 16px 16px; text-align: center; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.8; color: #9a978f; }
            .footer p { margin: 0; }
            .footer .tagline { font-family: 'Baskervville', 'Spectral', Georgia, 'Times New Roman', serif; font-style: italic; font-size: 15px; line-height: 1.5; color: #6f6c66; }
            .footer .notice { margin-top: 20px; }
            .footer .links { margin-top: 4px; letter-spacing: 0.4px; color: #57544f; }
            .footer a { color: #57544f; text-decoration: none; }
            .footer .unsub a { text-decoration: underline; }
            .footer .legal { margin-top: 18px; font-size: 11px; letter-spacing: 0.3px; line-height: 1.6; }
            @media (prefers-color-scheme: dark) {
              body, .outer-table { background-color: #0f0f0f !important; }
              .card { background-color: #1a1a1a !important; border-color: #242424 !important; }
              .masthead { background-color: #f4efe6 !important; border-color: #242424 !important; }
              .title, .body, .body a { color: #d7d7d7 !important; }
              .footer { background-color: #141414 !important; border-color: #242424 !important; color: #9a9590 !important; }
              .footer a, .footer .links, .footer .tagline { color: #d7d7d7 !important; }
              .action-btn { background-color: #f4efe6 !important; color: #0b0a06 !important; }
            }
            @media only screen and (max-width: 640px) {
              .outer { padding: 0 !important; }
              .card { border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
              .masthead, .body, .cta-cell, .footer { padding-left: 24px !important; padding-right: 24px !important; }
              .footer { border-radius: 0 !important; }
              .title { font-size: 27px !important; }
            }
          </style>
        </head>
        <body style="margin:0;padding:0;background-color:#fbfaf7;">
          <table role="presentation" class="outer-table" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#fbfaf7;">
            <tr>
              <td class="outer" align="center" style="padding:44px 12px 52px;">
                <!--[if mso]><table role="presentation" align="center" style="width:640px;"><tr><td><![endif]-->
                <table role="presentation" class="card" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background-color:#ffffff;border:1px solid #e7e5df;border-radius:16px;">
                  <tr>
                    <td class="masthead">
                      <a href="https://ckript.com" style="text-decoration:none;display:inline-block;">
                        <img src="https://ckript.com/ckript-logo-landscape-nobg.png" alt="Ckript" width="280" />
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td class="body">
                      <h1 class="title">${safeTitle}</h1>
                      ${htmlContent}
                    </td>
                  </tr>
                  ${actionUrl
                    ? `<tr><td class="cta-cell"><a href="${finalUrl}" class="action-btn">${buttonText}</a></td></tr>`
                    : `<tr><td style="padding:0 0 30px;font-size:1px;line-height:1px;">&nbsp;</td></tr>`}
                  <tr>
                    <td class="footer">
                      <p class="tagline">A minimal platform for storytellers.</p>
                      <p class="notice">You are receiving this because you subscribed to our updates.</p>
                      <p class="links">
                        <a href="https://ckript.com">Website</a> &nbsp;&middot;&nbsp;
                        <a href="https://ckript.com/privacy-policy">Privacy</a> &nbsp;&middot;&nbsp;
                        <a href="https://ckript.com/terms-of-service">Terms</a>${
                          // A VISIBLE link, not only the List-Unsubscribe header. Gmail shows its header
                          // control only for senders with reputation, and Outlook and Apple Mail never show it
                          // at all — so for most recipients this line is the only way out that exists. A
                          // recipient who cannot find one presses the spam button instead.
                          unsubscribeUrl ? ` &nbsp;&middot;&nbsp;\n                <span class="unsub"><a href="${unsubscribeUrl}">Unsubscribe</a> &nbsp;&middot;&nbsp;\n                <a href="${preferencesUrl}">Preferences</a></span>` : ""
                        }
                      </p>
                      ${signatureHtml()}
                      <p class="legal">Ckript Private Limited &nbsp;&middot;&nbsp; &copy; ${new Date().getFullYear()} Ckript. All rights reserved.</p>
                    </td>
                  </tr>
                </table>
                <!--[if mso]></td></tr></table><![endif]-->
              </td>
            </tr>
          </table>
        </body>
        </html>
    `;

    /*
     * RFC 8058 one-click unsubscribe.
     *
     * Gmail and Yahoo require this of anyone sending bulk mail, and they render their OWN unsubscribe
     * control beside the sender when both headers are present. That control is the one recipients
     * actually use; the alternative they reach for is the spam button, which costs the deliverability
     * of every message the platform sends rather than just this one.
     *
     * List-Unsubscribe-Post is what makes it one-click — without it the client merely opens the URL
     * and the recipient still has to do something. Both headers, or neither.
     *
     * Set for BROADCASTS only. A password reset or a receipt carrying an unsubscribe header invites
     * someone to switch off mail their own account depends on.
     */
    const listHeaders = unsubscribeUrl
      ? {
        "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${CONTACTS.support}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
      : {};

    /*
     * The Email Builder path sends the admin's compiled document, and since the redesign that
     * document carries its own footer — the same warm band as the wrapper above — with two slots for
     * the personal links. They are filled HERE, per recipient, because the unsubscribe token is
     * theirs and only exists at send time.
     *
     * A builder document WITHOUT slots (an older build still open in someone's browser, or HTML
     * pasted from elsewhere) gets the strip below injected before </body>, the way notify.js appends
     * the contact signature. Either way no bulk mail leaves without a visible way out.
     */
    const unsubscribeFooter = unsubscribeUrl
      ? `\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">`
        + `<tr><td align="center" style="padding:24px 16px;border-top:1px solid #e7e5df;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">`
        + `<p style="margin:0;font-size:12px;line-height:1.8;color:#9a978f;">You are receiving this because you subscribed to our updates.</p>`
        + `<p style="margin:8px 0 0;font-size:12px;line-height:1.8;color:#9a978f;">`
        + `<a href="${unsubscribeUrl}" style="color:#57544f;text-decoration:underline;">Unsubscribe</a>`
        + ` &nbsp;&middot;&nbsp; `
        + `<a href="${preferencesUrl}" style="color:#57544f;text-decoration:underline;">Preferences</a>`
        + `</p></td></tr></table>`
      : "";
    const hasFooterSlots = isBuilderV2 && finalHtml.includes(UNSUBSCRIBE_SLOT);
    // No signed link for this send (nothing bulk passes one today, but the parameter is optional):
    // the mailto that already backs the List-Unsubscribe header is the honest fallback.
    const unsubscribeHref = unsubscribeUrl || `mailto:${CONTACTS.support}?subject=unsubscribe`;
    const htmlForSend = hasFooterSlots
      ? finalHtml.split(UNSUBSCRIBE_SLOT).join(unsubscribeHref).split(PREFERENCES_SLOT).join(preferencesUrl)
      : isBuilderV2 && unsubscribeFooter
        ? (finalHtml.includes("</body>") ? finalHtml.replace("</body>", `${unsubscribeFooter}\n</body>`) : finalHtml + unsubscribeFooter)
        : finalHtml;

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: safeTitle,
      html: htmlForSend,
      headers: listHeaders,
      // A plain-text alternative, like every other template here. Without one a broadcast is
      // HTML-only, which reads as spam to filters and renders as nothing in a text-only client — and
      // it is the one message that goes to the whole audience at once.
      // htmlToPlainText, not a one-pass `replace(/<[^>]*>/g, "")`. That is the exact bug fixed in
      // htmlText.js and then written fresh here: one sweep lets "<<script>script>" reassemble, and it
      // decodes nothing, so an encoded tag survives into the text part.
      text: `${safeTitle}\n\n${htmlToPlainText(content).trim()}${
        actionUrl ? `\n\n${buttonText}: ${finalUrl}` : ""
      }\n\nTeam ${CONTACTS.name}${signatureText()}${
        // A visible link as well as the header. Plenty of clients render neither the header control
        // nor HTML, and a recipient who can find no way out is a spam complaint waiting to happen.
        unsubscribeUrl ? `\n\nDon't want these emails? Unsubscribe: ${unsubscribeUrl}\nManage preferences: ${preferencesUrl}` : ""
      }`,
      attachments: attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType
      }))
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending admin broadcast email:", error.message);
    return { success: false, error: error.message };
  }
};

export const sendCustomHtmlEmail = async (
  email,
  subject,
  html,
  attachments = []
) => {
  try {
    validateEmailConfig();

    const transporter = createTransporter();

    // The admin's markup goes out exactly as written; the signature is APPENDED rather than woven in,
    // so a direct email carries the same three contact addresses as every other template here without
    // this function having to understand the HTML it was handed.
    const body = String(html || "");
    const finalHtml = `${body}<div style="text-align:center;margin-top:20px;color:#666;font-size:12px">${signatureHtml()}</div>`;

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: subject,
      html: finalHtml,
      // A plain-text alternative. htmlToPlainText is the shared converter — it decodes entities before
      // stripping tags and strips repeatedly, so admin markup cannot smuggle a tag through.
      text: `${htmlToPlainText(body).trim()}\n\nTeam ${CONTACTS.name}${signatureText()}`,
      attachments: attachments.map(att => ({
        filename: att.filename,
        path: att.url, // Assuming url is a path or actual URL. If we use memory storage, we pass buffer. Let's support both.
        content: att.buffer,
        contentType: att.mimetype,
      })),
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending custom HTML email:", error.message);
    return { success: false, error: error.message };
  }
};

export const sendNewMessageEmail = async (
  email,
  receiverName,
  senderName,
  { clientBaseUrl = "" } = {}
) => {
  try {
    validateEmailConfig();

    const transporter = createTransporter();
    const safeReceiverName = String(receiverName || "Writer").trim();
    const safeSenderName = String(senderName || "An investor").trim();
    const messagesUrl = buildClientUrl("/messages", clientBaseUrl);

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: `New direct message from ${safeSenderName}`,
      html: renderMailDocument({
        title: `New direct message from ${safeSenderName}`,
        preheader: `${safeSenderName} has sent you a direct message regarding your work.`,
        blocks: [
          heading({ eyebrow: "New message", title: "You have a new message.", subtitle: `Film industry professional ${safeSenderName} has written to you about your work on Ckript.` }),
          paragraphs(`Hi ${safeReceiverName},\n\nDon't keep them waiting — head over to your messages to reply and start the conversation.`),
          button({ text: "Go to messages", url: messagesUrl }),
          fineprint("This is an automated email from Ckript. If you need help, contact our support team."),
        ],
      }),
      text: `Hi ${safeReceiverName},\n\nGreat news! Film industry professional ${safeSenderName} has sent you a direct message regarding your work on ckript.\n\nDon't keep them waiting—head over to your messages to reply and start the conversation!\n\nOpen Messages: ${messagesUrl}\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending new message email:", error.message);
    return { success: false, error: error.message };
  }
};

export const sendMeetingInvitationEmail = async (
  email,
  {
    producerName,
    scriptName,
    date,
    time,
    duration,
    meetingId,
    clientBaseUrl = "",
  }
) => {
  try {
    validateEmailConfig();

    const transporter = createTransporter();
    const dashboardUrl = buildClientUrl("/profile", clientBaseUrl);

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: `Meeting Request from Producer on Ckript`,
      html: renderMailDocument({
        title: "Meeting request from a producer",
        preheader: `${producerName} has requested a meeting about "${scriptName}".`,
        blocks: [
          heading({ eyebrow: "Meeting request", title: "A producer wants to meet.", subtitle: `${producerName} has requested a meeting with you regarding your script “${scriptName}”.` }),
          paragraphs("Hello,"),
          facts([["Date", date], ["Time", time], ["Duration", duration ? `${duration} minutes` : ""]]),
          paragraphs("Please review and respond to this request from your dashboard."),
          button({ text: "View request in dashboard", url: dashboardUrl }),
          fineprint("This is an automated email from Ckript. If you need help, contact our support team."),
        ],
      }),
      text: `Hello,\n\n${producerName} has requested a meeting with you regarding your script "${scriptName}".\n\nDate: ${date}\nTime: ${time}\nDuration: ${duration} minutes\n\nPlease review and respond to this request from your dashboard: ${dashboardUrl}\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending meeting invitation email:", error.message);
    return { success: false, error: error.message };
  }
};

export const sendMeetingAcceptedEmail = async (
  email,
  {
    writerName,
    scriptName,
    date,
    time,
    meetingLink,
    clientBaseUrl = "",
  }
) => {
  try {
    validateEmailConfig();
    const transporter = createTransporter();

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: `Meeting Confirmed: ${writerName}`,
      html: renderMailDocument({
        title: `Meeting confirmed: ${writerName}`,
        preheader: `${writerName} accepted your meeting request about "${scriptName}".`,
        blocks: [
          heading({ eyebrow: "Meeting confirmed", title: "You're on the calendar.", subtitle: `${writerName} has accepted your meeting request regarding the script “${scriptName}”.` }),
          paragraphs("Hello,"),
          facts([["Date", date], ["Time", time], { label: "Meeting link", value: meetingLink, href: meetingLink }]),
          button({ text: "Join meeting", url: meetingLink }),
          fineprint("This is an automated email from Ckript. If you need help, contact our support team."),
        ],
      }),
      text: `Hello,\n\n${writerName} has accepted your meeting request regarding the script "${scriptName}".\n\nDate: ${date}\nTime: ${time}\nMeeting Link: ${meetingLink}\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending meeting acceptance email:", error.message);
    return { success: false, error: error.message };
  }
};

export const sendMeetingAcceptedWriterEmail = async (
  email,
  {
    writerName,
    producerName,
    scriptName,
    date,
    time,
    meetingLink,
  }
) => {
  try {
    validateEmailConfig();
    const transporter = createTransporter();

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: `Meeting Details: ${producerName} - ckript`,
      html: renderMailDocument({
        title: `Meeting details: ${producerName}`,
        preheader: `Your meeting with ${producerName} about "${scriptName}" is confirmed.`,
        blocks: [
          heading({ eyebrow: "Meeting confirmed", title: "Meeting details confirmed.", subtitle: `You have accepted the meeting request from ${producerName} regarding your script “${scriptName}”.` }),
          paragraphs(`Hi ${writerName},`),
          facts([["Date", date], ["Time", time], { label: "Meeting link", value: meetingLink, href: meetingLink }]),
          paragraphs("Use the link above to join the meeting at the scheduled time."),
          button({ text: "Join meeting", url: meetingLink }),
          fineprint("This is an automated email from Ckript. We wish you a productive meeting."),
        ],
      }),
      text: `Hi ${writerName},\n\nYou have accepted the meeting request from ${producerName} regarding your script "${scriptName}".\n\nDate: ${date}\nTime: ${time}\nMeeting Link: ${meetingLink}\n\nPlease use the link above to join the meeting at the scheduled time.\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending meeting acceptance writer email:", error.message);
    return { success: false, error: error.message };
  }
};

export const sendMeetingRejectedEmail = async (
  email,
  {
    writerName,
    scriptName,
    clientBaseUrl = "",
  }
) => {
  try {
    validateEmailConfig();
    const transporter = createTransporter();

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: `Meeting Declined: ${writerName}`,
      html: renderMailDocument({
        title: `Meeting declined: ${writerName}`,
        preheader: `${writerName} has declined your meeting request about "${scriptName}".`,
        blocks: [
          heading({ eyebrow: "Meeting declined", title: "Meeting declined.", subtitle: `Unfortunately, ${writerName} has declined your meeting request regarding the script “${scriptName}”.` }),
          paragraphs("Hello,\n\nYour meeting quota slot for this request has been consumed and will not be refunded. You may reach out to them via direct messages instead."),
          fineprint("This is an automated email from Ckript. If you need help, contact our support team."),
        ],
      }),
      text: `Hello,\n\nUnfortunately, ${writerName} has declined your meeting request regarding the script "${scriptName}".\n\nYour meeting quota slot for this request has been consumed. You may reach out to them via direct messages instead.\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending meeting rejection email:", error.message);
    return { success: false, error: error.message };
  }
};

export const sendWriterPlanGrantedEmail = async (
  email,
  {
    writerName,
    planName,
    clientBaseUrl = "",
  }
) => {
  try {
    validateEmailConfig();
    const transporter = createTransporter();
    
    const formattedPlanName = planName === "gold" ? "Gold Model" : planName === "silver" ? "Silver Model" : planName;
    const loginUrl = buildClientUrl("/login", clientBaseUrl);

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: `🎉 You've been upgraded to ${formattedPlanName} — ckript`,
      html: renderMailDocument({
        title: `You've been upgraded to ${formattedPlanName}`,
        preheader: `An administrator has granted your account the ${formattedPlanName} plan.`,
        notice: AUTOMATED_NOTICE,
        blocks: [
          heading({ eyebrow: `${formattedPlanName} granted`, title: "Account upgraded.", subtitle: `An administrator on Ckript has granted your account the ${formattedPlanName} plan.` }),
          paragraphs(`Hi ${writerName},\n\nYou can now enjoy the premium benefits of your new plan, including higher visibility and premium features to accelerate your screenwriting career.`),
          button({ text: "Log in to Ckript", url: loginUrl }),
          linkFallback(loginUrl),
          paragraphs("Welcome to the premium tier."),
        ],
      }),
      text: `Hi ${writerName},\n\nGreat news! An administrator on ckript has granted your account the ${formattedPlanName} plan.\n\nYou can now enjoy all the premium benefits. Log in to explore: ${loginUrl}\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending writer plan granted email:", error.message);
    return { success: false, error: error.message };
  }
};

export const sendFipPlanGrantedEmail = async (
  email,
  {
    userName,
    clientBaseUrl = "",
  }
) => {
  try {
    validateEmailConfig();
    const transporter = createTransporter();
    
    const loginUrl = buildClientUrl("/login", clientBaseUrl);

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject: `🎉 You've been upgraded to Diamond Film Industry Professional — ckript`,
      html: renderMailDocument({
        title: "You've been upgraded to Diamond Film Industry Professional",
        preheader: "An administrator has granted your account a 1-year Diamond subscription.",
        notice: AUTOMATED_NOTICE,
        blocks: [
          heading({ eyebrow: "1-year Diamond plan granted", title: "Account upgraded.", subtitle: "An administrator on Ckript has granted your account a 1-year Diamond Film Industry Professional subscription." }),
          paragraphs(`Hi ${userName},\n\nYou can now enjoy all premium access features, including contact revelations, meeting bookings, and comprehensive script analytics.`),
          button({ text: "Log in to Ckript", url: loginUrl }),
          linkFallback(loginUrl),
          paragraphs("Welcome to Diamond."),
        ],
      }),
      text: `Hi ${userName},\n\nGreat news! An administrator on ckript has granted your account a 1-year Diamond Film Industry Professional subscription.\n\nYou can now enjoy all the premium benefits. Log in to explore: ${loginUrl}\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending FIP plan granted email:", error.message);
    return { success: false, error: error.message };
  }
};


/**
 * The decision on a "I already registered elsewhere" claim.
 *
 * One template for both outcomes, because they are the same message with a different answer and a
 * split would drift. Approval carries the entry ID the writer needs; rejection carries the reason and
 * says plainly that they can submit again — a dead end here means someone who paid on another
 * platform simply never enters.
 */
export const sendExternalRegistrationDecisionEmail = async (
  email,
  name,
  {
    decision,
    competitionName = "the challenge",
    providerLabel = "a third-party platform",
    externalRef = "",
    note = "",
    eventId = "",
    competitionId = "",
    clientBaseUrl = "",
  } = {}
) => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    const isApproved = String(decision || "").toLowerCase() === "approved";
    const safeNote = String(note || "").trim();
    const actionUrl = buildClientUrl(
      isApproved && competitionId ? `/challenges/${competitionId}` : "/challenges",
      clientBaseUrl,
    );
    const subject = isApproved
      ? `✅ You're in — ${competitionName}`
      : `Action needed: your ${competitionName} registration`;

    const mailOptions = {
      from: mailFrom(),
      to: email,
      subject,
      html: renderMailDocument({
        title: subject,
        preheader: isApproved
          ? `Your registration on ${providerLabel} is confirmed.`
          : `We could not confirm your registration on ${providerLabel} yet.`,
        notice: AUTOMATED_NOTICE,
        blocks: [
          heading({
            eyebrow: competitionName,
            title: isApproved ? "You're in." : "We could not confirm this yet.",
            subtitle: isApproved
              ? `We checked your registration on ${providerLabel} and you're confirmed. No payment is needed on Ckript — your entry is active.`
              : `We could not confirm your registration on ${providerLabel} from the details you sent. You can submit again with corrected details — your place is not lost.`,
          }),
          paragraphs(`Hi ${name},`),
          facts([["Platform", providerLabel], ["Your reference", externalRef], ["Your Ckript entry ID", isApproved ? eventId : ""]]),
          safeNote ? panel({ eyebrow: "Note from our team", text: safeNote }) : "",
          button({ text: isApproved ? "Open the challenge" : "Submit again", url: actionUrl }),
          linkFallback(actionUrl),
        ],
      }),
      text: `Hi ${name},\n\n${isApproved
        ? `Your registration on ${providerLabel} has been confirmed. No payment is needed on Ckript — your entry is active.${eventId ? `\n\nYour Ckript entry ID: ${eventId}` : ""}`
        : `We could not confirm your registration on ${providerLabel} from the details you sent. You can submit again with corrected details.`}${safeNote ? `\n\nNote from our team: ${safeNote}` : ""}\n\n${actionUrl}\n\nTeam ${CONTACTS.name}${signatureText()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`External registration ${decision} email sent to ${email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending external registration decision email:", error.message);
    return { success: false, error: error.message };
  }
};
