// admin-backend/controllers/authController.js

const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { provisionResourcesForUser, ensureUserResources } = require('../services/provisioningService');

/**
 * Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 * @param   {Object} req.body - { name, email, username, password }
 * @returns {Object} { message: string, user: Object }
 */
exports.registerUser = async (req, res) => {
  const { name, email, username, password } = req.body;
  
  try {
    // Sanitize and normalize inputs
    const sanitizedEmail = email.toLowerCase().trim();
    const sanitizedUsername = username.trim();
    const sanitizedName = name.trim();
    
    // Check if email or username already exists (parallel queries for performance)
    // Username: Must be globally unique across all users
    // Email: Must be globally unique for admins (since public registration creates admins)
    const [existingEmail, existingUsername] = await Promise.all([
      User.findOne({ email: sanitizedEmail, role: 'admin' }),
      User.findOne({ username: sanitizedUsername })
    ]);
    
    if (existingEmail) {
      return res.status(400).json({ 
        error: 'Email already in use',
        field: 'email'
      });
    }
    
    if (existingUsername) {
      return res.status(400).json({ 
        error: 'Username already taken. Please choose a different username.',
        field: 'username'
      });
    }

    // Hash the password securely with salt rounds from config or default to 10
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user document with provisioned resources
    // Note: Public registration creates admin accounts by default
    // Regular users should be created by admins via /api/users endpoint
    const user = new User({ 
      name: sanitizedName, 
      email: sanitizedEmail, 
      username: sanitizedUsername, 
      password: hashedPassword,
      role: 'admin', // Public registration creates admins
      isActive: true
    });

    try {
      const resources = provisionResourcesForUser({
        userId: user._id.toString(),
        username: sanitizedUsername
      });
      user.set(resources);
    } catch (provisionErr) {
      console.error('❌ Resource provisioning failed:', provisionErr);
      return res.status(500).json({ error: 'Failed to provision user resources' });
    }

    await user.save();

    console.log(`✅ New admin registered: ${sanitizedUsername} (${sanitizedEmail})`);

    // Generate JWT token for auto-login after registration
    const jwtExpiration = process.env.JWT_EXPIRATION || '1d';
    const token = jwt.sign(
      { 
        userId: user._id, 
        username: user.username, 
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: jwtExpiration,
        algorithm: 'HS256'
      }
    );
    
    res.status(201).json({ 
      message: 'Admin account registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        resourceId: user.resourceId,
        databaseUri: user.databaseUri,
        botEndpoint: user.botEndpoint,
        schedulerEndpoint: user.schedulerEndpoint,
        scraperEndpoint: user.scraperEndpoint
      }
    });
  } catch (err) {
    console.error('❌ Register error:', {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    
    // Handle mongoose validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    
    // Handle duplicate key errors (in case of race condition)
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({ 
        error: `${field.charAt(0).toUpperCase() + field.slice(1)} already in use`,
        field
      });
    }
    
    res.status(500).json({ error: 'Server error during registration' });
  }
};

/**
 * Login a user and return JWT token
 * @route   POST /api/auth/login
 * @access  Public
 * @param   {Object} req.body - { username, password, loginType }
 * @returns {Object} { token: string, user: Object }
 */
exports.loginUser = async (req, res) => {
  const { username, password, loginType } = req.body;
  
  try {
    // Sanitize input
    const sanitizedUsername = username.trim();
    const expectedLoginType = loginType || 'admin'; // Default to admin for backward compatibility
    
    // Find user by username
    const user = await User.findOne({ username: sanitizedUsername });
    
    // Use same error message for both invalid username and password
    // This prevents username enumeration attacks
    if (!user) {
      console.warn(`⚠️  Failed login attempt for non-existent user: ${sanitizedUsername}`);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Validate user is logging in from the correct page
    if (expectedLoginType === 'admin' && user.role !== 'admin') {
      console.warn(`⚠️  Regular user attempted admin login: ${sanitizedUsername}`);
      return res.status(403).json({ 
        error: 'Access denied. Please use the user login page.',
        redirectTo: '/user/login'
      });
    }

    if (expectedLoginType === 'user' && user.role !== 'user') {
      console.warn(`⚠️  Admin attempted user login: ${sanitizedUsername}`);
      return res.status(403).json({ 
        error: 'Access denied. Please use the admin login page.',
        redirectTo: '/login'
      });
    }

    if (!user.isActive) {
      console.warn(`⚠️  Inactive user attempted login: ${sanitizedUsername}`);
      return res.status(403).json({ error: 'Account is inactive. Please contact support.' });
    }

    // Compare password hash
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      console.warn(`⚠️  Failed login attempt for user: ${sanitizedUsername} (wrong password)`);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Get JWT expiration from env or use default
    const jwtExpiration = process.env.JWT_EXPIRATION || '1d';
    
    // Sign JWT token with minimal payload (don't include sensitive data)
    const token = jwt.sign(
      { 
        userId: user._id, 
        username: user.username, 
        email: user.email,
        role: user.role,
        ...(user.role === 'user' && user.adminId && { adminId: user.adminId.toString() })
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: jwtExpiration,
        algorithm: 'HS256' // Explicitly set algorithm to prevent algorithm confusion attacks
      }
    );
    
    // Make sure resource metadata is always available before issuing token
    await ensureUserResources(user);

    console.log(`✅ User logged in: ${sanitizedUsername}`);
    
    res.json({
      message: 'Login successful',
      token,
      user: { 
        id: user._id, 
        name: user.name, 
        username: user.username, 
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        resourceId: user.resourceId,
        databaseUri: user.databaseUri,
        botEndpoint: user.botEndpoint,
        schedulerEndpoint: user.schedulerEndpoint,
        scraperEndpoint: user.scraperEndpoint,
        ...(user.role === 'user' && user.adminId && { adminId: user.adminId.toString() })
      }
    });
  } catch (err) {
    console.error('❌ Login error:', {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    
    // Don't leak error details to client
    res.status(500).json({ error: 'Server error during login' });
  }
};