import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import nodemailer from 'nodemailer';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

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

// 2. MongoDB Connection for PDF Management (Cluster0.trdrhof)
const pdfDB = mongoose.createConnection('mongodb+srv://dhivarvinayak:dhivarvinayak@cluster0.trdrhof.mongodb.net/aibe?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
pdfDB.on('connected', () => console.log('✅ PDF DB connected to MongoDB.'));
pdfDB.on('error', err => console.error('❌ PDF DB connection error:', err));

// 3. MongoDB Connection for Groups/Sections (Cluster0.s1sdgdp)
const contentDB = mongoose.createConnection('mongodb+srv://dhivarvinayak:dhivarvinayak@cluster0.s1sdgdp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
contentDB.on('connected', () => console.log('✅ Content DB connected to MongoDB.'));
contentDB.on('error', err => console.error('❌ Content DB connection error:', err));

// === Mongoose Schemas & Models ===

// 1. User Schema for Password Reset
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  resetToken: String,
  resetTokenExpiry: Date,
});

// 2. PDF Schema for PDF Management
const pdfSchema = new mongoose.Schema({
  name: { type: String, required: true },
  filePath: { type: String, required: true },
  uploadedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// 3. Groups/Sections Schema
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
const Pdf = pdfDB.model('Pdf', pdfSchema);
const Group = contentDB.model('Group', GroupSchema);

// === Nodemailer Transporter Configuration ===
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'digitallaw2025@gmail.com',
    pass: 'kjrb jzxs qrbv oppr', // Consider using environment variables
  },
});

// === Multer Setup for File Uploads ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
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

// === PDF Routes (using pdfDB) ===

// 1. GET: Fetch all PDFs
app.get('/aibe-pdfs', async (req, res) => {
  try {
    const pdfs = await Pdf.find().select('-__v').sort({ createdAt: -1 });
    res.status(200).json(pdfs);
  } catch (err) {
    console.error('Error fetching PDFs:', err);
    res.status(500).json({ error: 'Failed to fetch PDFs' });
  }
});

// 2. POST: Add a new PDF
app.post('/add-aibe-pdf', upload.single('pdf'), async (req, res) => {
  const { name, uploadedBy } = req.body;
  
  if (!name || !req.file) {
    // Clean up uploaded file if validation fails
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    return res.status(400).json({ error: 'Name and PDF file are required' });
  }

  try {
    const pdf = new Pdf({
      name,
      filePath: req.file.path,
      uploadedBy: uploadedBy || 'Anonymous',
    });
    
    await pdf.save();
    res.status(201).json({
      _id: pdf._id,
      name: pdf.name,
      filePath: pdf.filePath,
      uploadedBy: pdf.uploadedBy,
      createdAt: pdf.createdAt
    });
  } catch (err) {
    // Clean up file if save fails
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    console.error('Error adding PDF:', err);
    res.status(500).json({ error: 'Failed to add PDF' });
  }
});

// 3. PUT: Update a PDF
app.put('/update-aibe-pdf/:id', async (req, res) => {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const pdf = await Pdf.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true, select: '-__v' }
    );
    
    if (!pdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }
    
    res.status(200).json(pdf);
  } catch (err) {
    console.error('Error updating PDF:', err);
    res.status(500).json({ error: 'Failed to update PDF' });
  }
});

// 4. DELETE: Delete a PDF
app.delete('/delete-aibe-pdf/:id', async (req, res) => {
  try {
    const pdf = await Pdf.findById(req.params.id);
    if (!pdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    // Delete the file from the filesystem
    if (fs.existsSync(pdf.filePath)) {
      fs.unlink(pdf.filePath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }

    await Pdf.deleteOne({ _id: req.params.id });
    res.status(200).json({ message: 'PDF deleted successfully' });
  } catch (err) {
    console.error('Error deleting PDF:', err);
    res.status(500).json({ error: 'Failed to delete PDF' });
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

// Serve uploaded PDFs
app.use('/uploads', express.static('uploads'));

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


//------------------------------------------mix-------------------------------------------------//

// Improved MongoDB connection with better error handling
const testsDB = mongoose.createConnection(
  'mongodb+srv://digitallaw2025:DhivarVinayak@cluster0.buidy6u.mongodb.net/testDB?retryWrites=true&w=majority', 
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000
  }
);

// Enhanced connection event handlers
testsDB.on('connected', () => console.log('✅ Tests DB connected to MongoDB'));
testsDB.on('disconnected', () => console.log('❌ Tests DB disconnected from MongoDB'));
testsDB.on('error', (err) => console.error('❌ Tests DB connection error:', err));

// Middleware to check DB connection
const checkDBConnection = (req, res, next) => {
  if (testsDB.readyState !== 1) {
    return res.status(500).json({ 
      error: 'Database not connected',
      details: 'Connection to MongoDB failed'
    });
  }
  next();
};

// Enhanced Test Management Schema with exactly 4 options
const testSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  questions: [{
    questionText: { 
      type: String, 
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1000
    },
    options: { 
      type: [{
        type: String,
        trim: true,
        minlength: 1,
        maxlength: 200
      }], 
      required: true,
      validate: {
        validator: function(v) {
          // Exactly 4 options, no duplicates (case insensitive)
          if (v.length !== 4) return false;
          const lowerCaseOptions = v.map(opt => opt.toLowerCase());
          return new Set(lowerCaseOptions).size === v.length;
        },
        message: 'Exactly 4 unique options are required (A, B, C, D)'
      }
    },
    correctAnswer: { 
      type: String, 
      required: true,
      enum: ['A', 'B', 'C', 'D'],
      message: 'Correct answer must be one of: A, B, C, D'
    },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const Test = testsDB.model('Test', testSchema);

// === Enhanced Test Management Routes ===

// 1. Create a new test
app.post('/api/tests', checkDBConnection, async (req, res) => {
  try {
    const test = new Test({
      name: req.body.name,
      description: req.body.description,
      questions: [] // Start with empty questions
    });
    await test.save();
    res.status(201).json(test);
  } catch (error) {
    console.error('Error creating test:', error);
    res.status(400).json({ 
      error: 'Failed to create test',
      details: error.message.replace('Validation failed: ', '')
    });
  }
});

// 2. Get all tests with question count
app.get('/api/tests', checkDBConnection, async (req, res) => {
  try {
    const tests = await Test.aggregate([
      {
        $project: {
          name: 1,
          description: 1,
          questionCount: { $size: "$questions" },
          createdAt: 1
        }
      },
      { $sort: { createdAt: -1 } }
    ]);
    res.json(tests);
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ 
      error: 'Failed to fetch tests',
      details: error.message 
    });
  }
});

// 3. Get single test by ID with all questions
app.get('/api/tests/:id', checkDBConnection, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    
    res.json({
      _id: test._id,
      name: test.name,
      description: test.description,
      questions: test.questions,
      createdAt: test.createdAt
    });
  } catch (error) {
    console.error('Error fetching test:', error);
    res.status(500).json({ 
      error: 'Failed to fetch test',
      details: error.message 
    });
  }
});

// 4. Update test details
app.put('/api/tests/:id', checkDBConnection, async (req, res) => {
  try {
    const updates = {
      name: req.body.name,
      description: req.body.description
    };
    
    const test = await Test.findByIdAndUpdate(
      req.params.id, 
      updates, 
      { new: true, runValidators: true }
    );
    
    if (!test) return res.status(404).json({ error: 'Test not found' });
    res.json(test);
  } catch (error) {
    console.error('Error updating test:', error);
    res.status(400).json({ 
      error: 'Failed to update test',
      details: error.message.replace('Validation failed: ', '')
    });
  }
});

// 5. Delete a test
app.delete('/api/tests/:id', checkDBConnection, async (req, res) => {
  try {
    const test = await Test.findByIdAndDelete(req.params.id);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    console.error('Error deleting test:', error);
    res.status(500).json({ 
      error: 'Failed to delete test',
      details: error.message 
    });
  }
});

// 6. Add question to test with validation
app.post('/api/tests/:id/questions', checkDBConnection, async (req, res) => {
  try {
    const { questionText, options, correctAnswer } = req.body;
    
    // Validate input
    if (!questionText || !options || !correctAnswer) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!Array.isArray(options) || options.length !== 4) {
      return res.status(400).json({ error: 'Exactly 4 options required' });
    }
    
    if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
      return res.status(400).json({ error: 'Correct answer must be A, B, C, or D' });
    }
    
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    
    test.questions.push({
      questionText,
      options,
      correctAnswer
    });
    
    await test.save();
    res.status(201).json(test);
  } catch (error) {
    console.error('Error adding question:', error);
    res.status(400).json({ 
      error: 'Failed to add question',
      details: error.message.replace('Validation failed: ', '')
    });
  }
});

// 7. Update question with full validation
app.put('/api/tests/:testId/questions/:questionId', checkDBConnection, async (req, res) => {
  try {
    const { questionText, options, correctAnswer } = req.body;
    
    // Validate input
    if (!questionText || !options || !correctAnswer) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!Array.isArray(options) || options.length !== 4) {
      return res.status(400).json({ error: 'Exactly 4 options required' });
    }
    
    if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
      return res.status(400).json({ error: 'Correct answer must be A, B, C, or D' });
    }
    
    const test = await Test.findById(req.params.testId);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    
    const question = test.questions.id(req.params.questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    
    question.questionText = questionText;
    question.options = options;
    question.correctAnswer = correctAnswer;
    
    await test.save();
    res.json(test);
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(400).json({ 
      error: 'Failed to update question',
      details: error.message.replace('Validation failed: ', '')
    });
  }
});

// 8. Delete question - Fixed version
app.delete('/api/tests/:testId/questions/:questionId', checkDBConnection, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    
    // Find the question index
    const questionIndex = test.questions.findIndex(
      q => q._id.toString() === req.params.questionId
    );
    
    if (questionIndex === -1) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    // Remove the question using splice
    test.questions.splice(questionIndex, 1);
    
    await test.save();
    res.json({ 
      message: 'Question deleted successfully',
      remainingQuestions: test.questions.length 
    });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ 
      error: 'Failed to delete question',
      details: error.message 
    });
  }
});

// 9. Submit test results
app.post('/api/test-results', checkDBConnection, async (req, res) => {
  try {
    const { testId, userEmail, score, totalQuestions } = req.body;
    
    // Basic validation
    if (!testId || !userEmail || score === undefined || !totalQuestions) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Here you would typically save the results to a TestResult collection
    // For now, we'll just return a success response
    res.json({
      success: true,
      message: 'Test results recorded',
      testId,
      userEmail,
      score,
      totalQuestions,
      percentage: Math.round((score / totalQuestions) * 100)
    });
  } catch (error) {
    console.error('Error submitting test results:', error);
    res.status(500).json({ 
      error: 'Failed to submit test results',
      details: error.message 
    });
  }
});


//--------------------test----------------------------//

// Add this route to get questions for a specific test
app.get('/api/tests/:id/questions', checkDBConnection, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    
    res.json(test.questions);
  } catch (error) {
    console.error('Error fetching test questions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch test questions',
      details: error.message 
    });
  }
});

// Enhanced question deletion endpoint
app.delete('/api/tests/:testId/questions/:questionId', checkDBConnection, async (req, res) => {
  try {
    const { testId, questionId } = req.params;

    // Find the test
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ 
        error: 'Test not found',
        details: `Test with ID ${testId} does not exist`
      });
    }

    // Find the question index
    const questionIndex = test.questions.findIndex(
      q => q._id.toString() === questionId
    );

    if (questionIndex === -1) {
      return res.status(404).json({ 
        error: 'Question not found',
        details: `Question with ID ${questionId} not found in test ${testId}`
      });
    }

    // Remove the question
    test.questions.splice(questionIndex, 1);
    
    // Save the updated test
    await test.save();

    res.status(200).json({
      success: true,
      message: 'Question deleted successfully',
      testId,
      questionId
    });

  } catch (error) {
    console.error('Error deleting question:', {
      params: req.params,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ 
      error: 'Failed to delete question',
      details: error.message,
      suggestion: 'Check server logs for more details'
    });
  }
});

//--------------------test----------------------------//

//------------------------------------------mix-------------------------------------------------//

// === Start Server ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
