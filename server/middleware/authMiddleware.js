// File: server/middleware/authMiddleware.js

import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_REALLY_SECRET_KEY_CHANGE_ME';

export const protect = async (req, res, next) => {
  console.log(`[Protect Middleware] Incoming request for: ${req.method} ${req.originalUrl}`);
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      console.log('[Protect Middleware] Token found in header:', token ? 'Yes' : 'No');

      const decoded = jwt.verify(token, JWT_SECRET);
      console.log('[Protect Middleware] JWT Decoded Payload:', JSON.stringify(decoded, null, 2));

      // Explicitly check if userId is a number and exists
      if (typeof decoded.userId !== 'number' || !decoded.email || !decoded.role) {
          console.error('[Protect Middleware] CRITICAL: Token payload invalid or userId is not a number.');
          console.error('[Protect Middleware] Decoded userId:', decoded.userId, 'Type:', typeof decoded.userId);
          return res.status(401).json({ message: 'Not authorized, token payload invalid (userId issue)' });
      }
      
      req.user = {
          id: decoded.userId, // userId from token
          email: decoded.email,
          role: decoded.role 
      };
      console.log('[Protect Middleware] req.user populated from token:', JSON.stringify(req.user, null, 2));

      // Now req.user.id should definitely be a number if the above check passed
      const userExists = await prisma.user.findUnique({ 
          where: { id: req.user.id }, // This is where the error was reported
          select: { id: true, email: true, role: true, isPending: true } 
      });

      if (!userExists) {
          console.warn(`[Protect Middleware] User with ID ${req.user.id} from token not found in DB.`);
          return res.status(401).json({ message: 'Not authorized, user not found' });
      }
      
      req.user = {
          id: userExists.id,
          email: userExists.email,
          role: userExists.role, 
          isPending: userExists.isPending 
      };
      console.log('[Protect Middleware] req.user updated with fresh DB data:', JSON.stringify(req.user, null, 2));

      if (!req.user.role) { 
        console.error('[Protect Middleware] CRITICAL - req.user.role is undefined or null AFTER DB FETCH. User from DB:', JSON.stringify(userExists, null, 2));
        return res.status(500).json({ message: 'Server error: User role missing after DB verification.' });
      }

      console.log('[Protect Middleware] Authorization successful, calling next().');
      next();
    } catch (error) {
      console.error('[Protect Middleware] Token verification failed:', error.name, error.message);
      if (error.name === 'TokenExpiredError') {
          return res.status(401).json({ message: 'Not authorized, token expired' });
      }
      if (error.name === 'JsonWebTokenError') {
          return res.status(401).json({ message: 'Not authorized, token malformed' });
      }
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    console.log('[Protect Middleware] No token found in Authorization header.');
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    console.log(`[Authorize Middleware] Checking roles for: ${req.method} ${req.originalUrl}`);
    console.log('[Authorize Middleware] Received req.user:', JSON.stringify(req.user, null, 2));
    console.log('[Authorize Middleware] Allowed roles:', roles);

    if (!req.user || !req.user.role) { 
        console.error('[Authorize Middleware] CRITICAL: req.user or req.user.role is missing.');
        console.error('[Authorize Middleware] req.user value was:', JSON.stringify(req.user));
        return res.status(401).json({ message: 'Not authorized (user data missing from request processing)' });
    }

    if (!roles.includes(req.user.role)) {
      console.warn(`[Authorize Middleware] User ${req.user.email} (Role: ${req.user.role}) is NOT AUTHORIZED for this resource. Allowed: ${roles.join(', ')}`);
      return res.status(403).json({ message: `Forbidden: Role ${req.user.role} is not authorized to access this resource` });
    }

    console.log(`[Authorize Middleware] User ${req.user.email} (Role: ${req.user.role}) IS AUTHORIZED. Calling next().`);
    next();
  };
};
