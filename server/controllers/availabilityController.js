import mongoose from "mongoose";
import Availability from "../models/Availability.js";
import User from "../models/User.js";

export const getAvailability = async (req, res) => {
  try {
    const { professionalId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(professionalId)) {
      return res.status(400).json({ message: "Invalid professional ID format." });
    }

    const professional = await User.findById(professionalId).select("role industryProfile");
    if (!professional) {
      return res.status(404).json({ message: "Professional not found." });
    }

    const validRoles = ["producer", "director", "professional", "industry"];
    if (!validRoles.includes(professional.role.toLowerCase())) {
      return res.status(400).json({ message: "User is not a valid professional." });
    }

    let availability = await Availability.findOne({ professional: professionalId });
    if (!availability) {
      availability = new Availability({
        professional: professionalId,
        enabled: false,
        schedule: {
          monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
        }
      });
      await availability.save();
    }

    return res.status(200).json(availability);
  } catch (error) {
    console.error("Error fetching availability:", error);
    return res.status(500).json({ message: "Failed to fetch availability." });
  }
};

export const updateAvailability = async (req, res) => {
  try {
    const professionalId = req.user._id;

    const professional = await User.findById(professionalId).select("role");
    if (!professional) {
      return res.status(404).json({ message: "User not found." });
    }

    const validRoles = ["producer", "director", "professional", "industry"];
    if (!validRoles.includes(professional.role.toLowerCase())) {
      return res.status(403).json({ message: "Only professionals can set availability." });
    }

    const {
      enabled,
      consultationPrice,
      currency,
      duration,
      buffer,
      advanceBookingHours,
      maxBookingDays,
      timezone,
      schedule
    } = req.body;

    let availability = await Availability.findOne({ professional: professionalId });

    if (!availability) {
      availability = new Availability({
        professional: professionalId,
      });
    }

    if (enabled !== undefined) availability.enabled = enabled;
    if (consultationPrice !== undefined) availability.consultationPrice = consultationPrice;
    if (currency !== undefined) availability.currency = currency;
    if (duration !== undefined) availability.duration = duration;
    if (buffer !== undefined) availability.buffer = buffer;
    if (advanceBookingHours !== undefined) availability.advanceBookingHours = advanceBookingHours;
    if (maxBookingDays !== undefined) availability.maxBookingDays = maxBookingDays;
    if (timezone !== undefined) availability.timezone = timezone;
    if (schedule !== undefined) availability.schedule = schedule;

    await availability.save();

    return res.status(200).json({ message: "Availability updated successfully.", availability });
  } catch (error) {
    console.error("Error updating availability:", error);
    return res.status(500).json({ message: "Failed to update availability." });
  }
};
