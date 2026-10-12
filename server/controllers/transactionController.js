import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import Script from "../models/Script.js";
import ScriptOption from "../models/ScriptOption.js";
import { asInt, asTrimmedString } from "../utils/requestValue.js";

const normalizedCurrency = "INR";
const BANK_REVIEW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_BANK_INVALID_ATTEMPTS = 5;
const ACCOUNT_NUMBER_REGEX = /^\d{8,20}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const GENERIC_ROUTING_REGEX = /^[A-Z0-9-]{4,20}$/;
const COUNTRY_REGEX = /^[A-Z]{2}$/;
const CURRENCY_REGEX = /^[A-Z]{3}$/;
const BANK_ACCOUNT_TYPES = new Set(["checking", "savings", "business"]);
const BANK_DETAILS_BLOCKED_MESSAGE = "Too many invalid attempts. Bank detail updates are blocked. Please contact support team.";

const maskAccountNumber = (accountNumber = "") => {
  if (!accountNumber) return "";
  const last4 = String(accountNumber).slice(-4);
  return `****${last4}`;
};

const sanitizeBankDetailsForResponse = (bankDetails) => {
  if (!bankDetails || !bankDetails.accountNumber) return null;
  const plain = bankDetails?.toObject ? bankDetails.toObject() : bankDetails;
  return {
    ...plain,
    accountNumber: maskAccountNumber(plain.accountNumber),
  };
};

const sanitizeBankReviewForResponse = (bankDetailsReview) => {
  if (!bankDetailsReview) {
    return { status: "not_submitted" };
  }

  const plain = bankDetailsReview?.toObject ? bankDetailsReview.toObject() : bankDetailsReview;
  const requested = plain?.requestedDetails || {};

  return {
    status: plain.status || "not_submitted",
    submittedAt: plain.submittedAt,
    dueAt: plain.dueAt,
    reviewedAt: plain.reviewedAt,
    adminNote: plain.adminNote || "",
    requestedDetails: requested.accountNumber
      ? {
          ...requested,
          accountNumber: maskAccountNumber(requested.accountNumber),
        }
      : null,
  };
};

const sanitizeBankSecurityForResponse = (bankDetailsSecurity) => ({
  invalidAttempts: Number(bankDetailsSecurity?.invalidAttempts || 0),
  isLocked: Boolean(bankDetailsSecurity?.isLocked),
  lockedAt: bankDetailsSecurity?.lockedAt,
});

const normalizeIncomingBankDetails = (payload = {}) => ({
  accountHolderName: String(payload.accountHolderName || "").trim(),
  bankName: String(payload.bankName || "").trim(),
  accountNumber: String(payload.accountNumber || "").replace(/\s+/g, ""),
  routingNumber: String(payload.routingNumber || "").replace(/\s+/g, "").toUpperCase(),
  accountType: String(payload.accountType || "checking").trim().toLowerCase(),
  swiftCode: String(payload.swiftCode || "").trim().toUpperCase(),
  iban: String(payload.iban || "").trim().toUpperCase(),
  country: String(payload.country || "IN").trim().toUpperCase(),
  currency: String(payload.currency || "INR").trim().toUpperCase(),
});

const getInvalidBankDetailsMessage = (bankDetails) => {
  if (!BANK_ACCOUNT_TYPES.has(bankDetails.accountType)) {
    return "Account type must be checking, savings, or business";
  }

  if (!COUNTRY_REGEX.test(bankDetails.country)) {
    return "Country must be a two-letter code";
  }

  if (!CURRENCY_REGEX.test(bankDetails.currency)) {
    return "Currency must be a three-letter code";
  }

  if (!ACCOUNT_NUMBER_REGEX.test(bankDetails.accountNumber || "")) {
    return "Account number must be 8-20 digits";
  }

  if (!bankDetails.routingNumber) {
    return "Routing / IFSC number is required";
  }

  if (bankDetails.country === "IN") {
    if (!IFSC_REGEX.test(bankDetails.routingNumber)) {
      return "Please enter a valid IFSC code (example: HDFC0001234)";
    }
  } else if (!GENERIC_ROUTING_REGEX.test(bankDetails.routingNumber)) {
    return "Routing number must be 4-20 letters, numbers, or hyphen";
  }

  return "";
};

const ensureBankDetailsSecurity = (user) => {
  if (!user.bankDetailsSecurity) {
    user.bankDetailsSecurity = {};
  }

  if (typeof user.bankDetailsSecurity.invalidAttempts !== "number") {
    user.bankDetailsSecurity.invalidAttempts = 0;
  }

  if (typeof user.bankDetailsSecurity.isLocked !== "boolean") {
    user.bankDetailsSecurity.isLocked = false;
  }

  return user.bankDetailsSecurity;
};

const recordInvalidBankAttempt = async (user, reason = "Invalid bank details") => {
  const security = ensureBankDetailsSecurity(user);
  security.invalidAttempts = Number(security.invalidAttempts || 0) + 1;
  security.lastInvalidAttemptAt = new Date();
  security.lastInvalidReason = String(reason || "Invalid bank details");

  if (security.invalidAttempts >= MAX_BANK_INVALID_ATTEMPTS) {
    security.isLocked = true;
    security.lockedAt = new Date();
  }

  user.markModified("bankDetailsSecurity");
  await user.save();

  return security;
};

export const serializeTransaction = (transaction) => {
  const plainTransaction = transaction?.toObject ? transaction.toObject() : transaction;
  const currency = String(plainTransaction?.currency || "").trim().toUpperCase();
  const baseCurrency = String(plainTransaction?.baseCurrency || "").trim().toUpperCase();
  return {
    _id: plainTransaction?._id,
    type: plainTransaction?.type,
    amount: Number(plainTransaction?.amount || 0),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : normalizedCurrency,
    baseCurrency: /^[A-Z]{3}$/.test(baseCurrency) ? baseCurrency : normalizedCurrency,
    baseAmount: plainTransaction?.baseAmount,
    fxRate: plainTransaction?.fxRate,
    status: plainTransaction?.status,
    description: plainTransaction?.description || "",
    reference: plainTransaction?.reference || "",
    paymentMethod: plainTransaction?.paymentMethod || "",
    relatedScript: plainTransaction?.relatedScript || null,
    relatedProject: plainTransaction?.relatedProject || null,
    createdAt: plainTransaction?.createdAt,
    updatedAt: plainTransaction?.updatedAt,
  };
};

// @desc    Get user transactions
// @route   GET /api/transactions
// @access  Private
export const getUserTransactions = async (req, res) => {
  try {
    const { page: rawPage, limit: rawLimit, type: rawType, status: rawStatus } = req.query;

    // A filter that arrives as an object or an array is never a transaction type or status. Refusing it
    // is what keeps a malformed filter from being answered with the unfiltered list.
    const isMalformedFilter = (value) => value !== undefined && typeof value !== "string";
    if (isMalformedFilter(rawType) || isMalformedFilter(rawStatus)) {
      return res.status(400).json({ message: "Invalid transaction filter" });
    }

    const page = asInt(rawPage, { min: 1, fallback: 1 });
    const limit = asInt(rawLimit, { min: 1, max: 100, fallback: 20 });
    const type = asTrimmedString(rawType, 40);
    const status = asTrimmedString(rawStatus, 40);

    const query = { user: req.user._id };

    if (type) query.type = type;
    if (status) query.status = status;

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .populate('relatedScript', 'title')
      .populate('relatedProject', 'title');
    
    const total = await Transaction.countDocuments(query);
    
    res.json({
      transactions: transactions.map(serializeTransaction),
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get transaction by ID
// @route   GET /api/transactions/:id
// @access  Private
export const getTransactionById = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user._id
    })
      .populate('relatedScript', 'title')
      .populate('relatedProject', 'title');
    
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    
    res.json(serializeTransaction(transaction));
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get wallet balance
// @route   GET /api/transactions/wallet/balance
// @access  Private
export const getWalletBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('wallet');
    res.json({
      balance: user?.wallet?.balance || 0,
      currency: normalizedCurrency,
      pendingBalance: user?.wallet?.pendingBalance || 0,
      totalEarnings: user?.wallet?.totalEarnings || 0,
      totalWithdrawals: user?.wallet?.totalWithdrawals || 0,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Request withdrawal
// @route   POST /api/transactions/withdraw
// @access  Private
export const requestWithdrawal = async (req, res) => {
  try {
    // Coerced and rounded: a string amount used to reach `pendingBalance + amount` and CONCATENATE
    // ("500" + 100 = "500100") instead of adding.
    const amount = Math.round(Number(req.body?.amount) * 100) / 100;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid withdrawal amount" });
    }
    
    const user = await User.findById(req.user._id);
    
    if (!user.wallet || user.wallet.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }
    
    if (!user.bankDetails || !user.bankDetails.accountNumber) {
      return res.status(400).json({ 
        message: "Please add your bank details before requesting a withdrawal" 
      });
    }
    
    // Create withdrawal transaction
    const transaction = await Transaction.create({
      user: req.user._id,
      type: "withdrawal",
      amount: -amount,
      status: "pending",
      description: `Withdrawal request to ${user.bankDetails.bankName || 'bank account'}`,
      reference: Transaction.generateReference('withdrawal'),
      paymentMethod: "bank_transfer",
      bankTransferDetails: {
        accountNumber: user.bankDetails.accountNumber,
        routingNumber: user.bankDetails.routingNumber,
        bankName: user.bankDetails.bankName,
        accountHolderName: user.bankDetails.accountHolderName
      },
      balanceBefore: user.wallet.balance,
      balanceAfter: user.wallet.balance - amount
    });
    
    // Update user wallet (move to pending)
    user.wallet.balance -= amount;
    user.wallet.pendingBalance = Number(user.wallet.pendingBalance || 0) + amount;
    await user.save();
    
    res.status(201).json({ 
      message: "Withdrawal request submitted successfully",
      transaction 
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update bank details
// @route   PUT /api/transactions/bank-details
// @access  Private
export const updateBankDetails = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const security = ensureBankDetailsSecurity(user);
    if (security.isLocked) {
      return res.status(403).json({ message: BANK_DETAILS_BLOCKED_MESSAGE });
    }

    const requestedDetails = normalizeIncomingBankDetails(req.body);
    if (!requestedDetails.accountHolderName || !requestedDetails.bankName || !requestedDetails.accountNumber || !requestedDetails.routingNumber) {
      const updatedSecurity = await recordInvalidBankAttempt(user, "Missing required bank details fields");
      if (updatedSecurity.isLocked) {
        return res.status(403).json({ message: BANK_DETAILS_BLOCKED_MESSAGE });
      }
      return res.status(400).json({ message: "Account holder name, bank name, account number, and routing / IFSC number are required" });
    }

    if (requestedDetails.accountNumber.startsWith("****") || requestedDetails.accountNumber.includes("*")) {
      const updatedSecurity = await recordInvalidBankAttempt(user, "Masked account number submitted");
      if (updatedSecurity.isLocked) {
        return res.status(403).json({ message: BANK_DETAILS_BLOCKED_MESSAGE });
      }
      return res.status(400).json({ message: "Please enter the full account number (masked values are not allowed)" });
    }

    const invalidBankDetailsMessage = getInvalidBankDetailsMessage(requestedDetails);
    if (invalidBankDetailsMessage) {
      const updatedSecurity = await recordInvalidBankAttempt(user, invalidBankDetailsMessage);
      if (updatedSecurity.isLocked) {
        return res.status(403).json({ message: BANK_DETAILS_BLOCKED_MESSAGE });
      }
      return res.status(400).json({ message: invalidBankDetailsMessage });
    }

    if (requestedDetails.country === "IN") {
      requestedDetails.currency = "INR";
    }

    const now = new Date();
    user.bankDetailsReview = {
      status: "pending",
      requestedDetails,
      submittedAt: now,
      dueAt: new Date(now.getTime() + BANK_REVIEW_WINDOW_MS),
      reviewedAt: undefined,
      reviewedBy: undefined,
      adminNote: "",
    };

    security.invalidAttempts = 0;
    security.lastInvalidAttemptAt = undefined;
    security.lastInvalidReason = "";
    user.markModified("bankDetailsSecurity");
    
    await user.save();

    res.json({ 
      message: "Bank details submitted for admin review. Review completes within 2 days.",
      bankDetails: sanitizeBankDetailsForResponse(user.bankDetails),
      bankDetailsReview: sanitizeBankReviewForResponse(user.bankDetailsReview),
      bankDetailsSecurity: sanitizeBankSecurityForResponse(user.bankDetailsSecurity),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get bank details
// @route   GET /api/transactions/bank-details
// @access  Private
export const getBankDetails = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('bankDetails bankDetailsReview bankDetailsSecurity');
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const bankDetails = sanitizeBankDetailsForResponse(user.bankDetails);
    const bankDetailsReview = sanitizeBankReviewForResponse(user.bankDetailsReview);

    res.json({
      bankDetails,
      bankDetailsReview,
      bankDetailsSecurity: sanitizeBankSecurityForResponse(user.bankDetailsSecurity),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get transaction statistics
// @route   GET /api/transactions/stats
// @access  Private
export const getTransactionStats = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get total earnings
    const earnings = await Transaction.aggregate([
      { 
        $match: { 
          user: userId, 
          type: { $in: ['credit', 'bonus', 'commission'] },
          status: 'completed'
        } 
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    // Get total spending
    const spending = await Transaction.aggregate([
      { 
        $match: { 
          user: userId, 
          type: { $in: ['debit', 'payment', 'subscription'] },
          status: 'completed'
        } 
      },
      { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
    ]);

    const creatorScripts = await Script.find({ creator: userId })
      .select('_id price unlockedBy')
      .lean();

    const scriptIds = creatorScripts.map((script) => script._id);
    const projectSalesEarnings = creatorScripts.reduce((sum, script) => {
      const unlockCount = Array.isArray(script.unlockedBy) ? script.unlockedBy.length : 0;
      const salePrice = Number(script.price || 0);
      const creatorPayout = salePrice;
      return sum + unlockCount * creatorPayout;
    }, 0);

    const holdPayouts = scriptIds.length > 0
      ? await ScriptOption.aggregate([
          {
            $match: {
              script: { $in: scriptIds },
              status: { $in: ['active', 'converted', 'expired'] },
            }
          },
          { $group: { _id: null, total: { $sum: '$creatorPayout' } } }
        ])
      : [];

    const holdEarnings = holdPayouts[0]?.total || 0;
    
    // Get pending transactions
    const pending = await Transaction.countDocuments({
      user: userId,
      status: 'pending'
    });
    
    // Recent transactions
    const recent = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.json({
      totalEarnings: earnings[0]?.total || 0,
      totalSpending: spending[0]?.total || 0,
      projectSalesEarnings,
      holdEarnings,
      totalProjectRevenue: projectSalesEarnings + holdEarnings,
      pendingTransactions: pending,
      recentTransactions: recent.map(serializeTransaction),
      currency: normalizedCurrency,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
