import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import nodemailer from 'nodemailer';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import ImageKit from 'imagekit';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// === ES Module equivalents for __dirname ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === App Initialization ===
const app = express();
app.use(cors());
app.use(express.json());

// === Database Connections ===

// 1. MongoDB Connection for Password Reset (Cluster0.s1sdgdp)
const authDB = mongoose.createConnection('mongodb+srv://dhivarvinayak:dhivarvinayak@cluster0.s1sdgdp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
authDB.on('connected', () => console.log('✅ Auth DB connected to MongoDB.'));
authDB.on('error', err => console.error('❌ Auth DB connection error:', err));

// 2. MongoDB Connection for Groups/Sections (Cluster0.s1sdgdp)
const contentDB = mongoose.createConnection('mongodb+srv://dhivarvinayak:dhivarvinayak@cluster0.s1sdgdp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
contentDB.on('connected', () => console.log('✅ Content DB connected to MongoDB.'));
contentDB.on('error', err => console.error('❌ Content DB connection error:', err));

// === ImageKit Initialization with correct credentials ===
const imagekit = new ImageKit({
    publicKey: "public_rjHIUyE+3f1dTeabLndOCgg81M4=",
    privateKey: "private_Bml1q/l+P0BvVcA2KUAPHj2IZ8s=",
    urlEndpoint: "https://ik.imagekit.io/vinayak123"
});

// === Cloudinary Configuration ===
cloudinary.config({
  cloud_name: 'dnumdrets',
  api_key: '187259726668194',
  api_secret: 'CfBL6Wx1p_oCmk9yWqzF5sOU05g'
});

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'aibe-pdfs',
    format: async (req, file) => 'pdf',
    public_id: (req, file) => {
      const filename = file.originalname.split('.')[0];
      return `${filename}-${Date.now()}`;
    }
  }
});

// === Mongoose Schemas & Models ===

// 1. User Schema for Password Reset
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  resetToken: String,
  resetTokenExpiry: Date,
});

// 2. Groups/Sections Schema
const SectionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  text: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const GroupSchema = new mongoose.Schema({
  actId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  sections: [SectionSchema],
  createdAt: { type: Date, default: Date.now }
});

const User = authDB.model('users', userSchema);
const Group = contentDB.model('Group', GroupSchema);

// === Nodemailer Transporter Configuration ===
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'digitallaw2025@gmail.com',
    pass: 'kjrb jzxs qrbv oppr',
  },
});

// === Multer Setup for File Uploads ===
const upload = multer({
  storage: cloudinaryStorage, // Using Cloudinary storage
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
});

// === Utility Functions ===

// 1. Generate Token for Password Reset
const generateToken = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 10)}`;
};

// 2. Send Reset Email
const sendResetEmail = (email, token) => {
  const resetLink = `https://passwordreset-lilac.vercel.app/reset-password/${token}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <h2 style="color: #333;">Password Reset Request</h2>
      <p>We received a request to reset your password. Click the button below to proceed:</p>
      <a href="${resetLink}" 
         style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">
         Reset Password
      </a>
      <p style="font-size: 12px; color: #777;">
        This link will expire in <strong>10 minutes</strong>. If you didn't request this, please ignore this email.
      </p>
      <hr style="margin-top: 30px;" />
      <p style="font-size: 14px; color: #555;">
        Thank you,<br/>
        <strong>DgAct - Digital</strong>
      </p>
    </div>
  `;

  return transporter.sendMail({
    from: '"Digital Law Support" <digitallaw2025@gmail.com>',
    to: email,
    subject: 'Password Reset Request',
    html: htmlContent,
  });
};

// === API Routes ===

// === Auth Routes (using authDB) ===

// 1. Request Password Reset
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user)
      return res.status(400).json({ message: 'No account found with this email address.' });

    const token = generateToken();
    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    await sendResetEmail(email, token);

    res.status(200).json({ message: 'A password reset link has been sent to your email address.' });
  } catch (error) {
    console.error('❌ Error in /forgot-password:', error);
    res.status(500).json({ message: 'Internal server error. Please try again later.' });
  }
});

// 2. Reset Password
app.post('/api/auth/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ message: 'Invalid or expired password reset token.' });

    user.password = newPassword;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;

    await user.save();

    res.status(200).json({ message: 'Your password has been successfully updated.' });
  } catch (error) {
    console.error('❌ Error in /reset-password:', error);
    res.status(500).json({ message: 'Failed to reset password. Please try again later.' });
  }
});

// === PDF Routes (using Cloudinary) ===

// 1. POST: Upload PDF to Cloudinary
app.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    // Cloudinary automatically uploads the file via multer-storage-cloudinary
    const result = req.file; // Contains Cloudinary response

    res.status(201).json({
      success: true,
      fileInfo: {
        url: result.path,
        publicId: result.filename,
        format: result.format,
        bytes: result.size
      }
    });
  } catch (err) {
    console.error('Error uploading PDF:', err);
    res.status(500).json({ error: 'Failed to upload PDF' });
  }
});

// 2. DELETE: Delete PDF from Cloudinary
app.delete('/delete-pdf/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    
    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result === 'ok') {
      res.status(200).json({ message: 'PDF deleted successfully' });
    } else {
      res.status(404).json({ error: 'PDF not found' });
    }
  } catch (err) {
    console.error('Error deleting PDF:', err);
    res.status(500).json({ error: 'Failed to delete PDF' });
  }
});

// === ImageKit Routes ===

// 1. Upload image to ImageKit
app.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const result = await imagekit.upload({
      file: req.file.buffer,
      fileName: `${Date.now()}-${req.file.originalname}`,
      useUniqueFileName: true
    });

    res.status(201).json({
      success: true,
      fileInfo: {
        url: result.url,
        fileId: result.fileId,
        fileType: result.fileType
      }
    });
  } catch (err) {
    console.error('Error uploading image:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// 2. Delete image from ImageKit
app.delete('/delete-image/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    await imagekit.deleteFile(fileId);
    
    res.status(200).json({ message: 'Image deleted successfully' });
  } catch (err) {
    console.error('Error deleting image:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// === Groups/Sections Routes (using contentDB) ===

// 1. Get all groups for an act
app.get('/api/groups/:actId', async (req, res) => {
  try {
    const groups = await Group.find({ actId: req.params.actId });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. Add a new group
app.post('/api/groups/:actId', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Group name is required' });
    }
    
    const group = new Group({
      actId: req.params.actId,
      name
    });
    
    const newGroup = await group.save();
    res.status(201).json(newGroup);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// 3. Update a group
app.put('/api/groups/:groupId', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Group name is required' });
    }
    
    const updatedGroup = await Group.findByIdAndUpdate(
      req.params.groupId,
      { name },
      { new: true }
    );
    
    if (!updatedGroup) {
      return res.status(404).json({ message: 'Group not found' });
    }
    
    res.json(updatedGroup);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// 4. Delete a group
app.delete('/api/groups/:groupId', async (req, res) => {
  try {
    const deletedGroup = await Group.findByIdAndDelete(req.params.groupId);
    if (!deletedGroup) {
      return res.status(404).json({ message: 'Group not found' });
    }
    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// SECTION OPERATIONS

// 5. Add a new section to a group
app.post('/api/groups/:groupId/sections', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Section name is required' });
    }
    
    const updatedGroup = await Group.findByIdAndUpdate(
      req.params.groupId,
      { $push: { sections: { name } } },
      { new: true }
    );
    
    if (!updatedGroup) {
      return res.status(404).json({ message: 'Group not found' });
    }
    
    const newSection = updatedGroup.sections[updatedGroup.sections.length - 1];
    res.status(201).json(newSection);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// 6. Update a section (name or text)
app.put('/api/groups/:groupId/sections/:sectionId', async (req, res) => {
  try {
    const { name, text } = req.body;
    
    const updateFields = {};
    if (name !== undefined) updateFields['sections.$.name'] = name;
    if (text !== undefined) updateFields['sections.$.text'] = text;
    
    const updatedGroup = await Group.findOneAndUpdate(
      { 
        _id: req.params.groupId,
        'sections._id': req.params.sectionId 
      },
      { $set: updateFields },
      { new: true }
    );
    
    if (!updatedGroup) {
      return res.status(404).json({ message: 'Group or section not found' });
    }
    
    const updatedSection = updatedGroup.sections.find(
      section => section._id.toString() === req.params.sectionId
    );
    
    res.json(updatedSection);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// 7. Delete a section - Fixed implementation
app.delete('/api/groups/:groupId/sections/:sectionId', async (req, res) => {
  try {
    const { groupId, sectionId } = req.params;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(groupId) || 
        !mongoose.Types.ObjectId.isValid(sectionId)) {
      return res.status(400).json({ message: 'Invalid groupId or sectionId' });
    }

    // Convert string ID to ObjectId
    const sectionObjectId = new mongoose.Types.ObjectId(sectionId);

    // Update the group by pulling the section
    const result = await Group.updateOne(
      { _id: groupId },
      { $pull: { sections: { _id: sectionObjectId } } }
    );

    // Check if the group was found and modified
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Group not found' });
    }
    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'Section not found or already deleted' });
    }

    res.json({ message: 'Section deleted successfully' });
  } catch (err) {
    console.error('Delete section error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete section' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  } else if (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  
  next();
});

// === Start Server ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
