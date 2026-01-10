const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store active users
const users = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // User registers with phone number
  socket.on('register', (data) => {
    const { phoneNumber, userName } = data;
    
    // Store user info
    users.set(socket.id, {
      id: socket.id,
      phoneNumber,
      userName,
      status: 'available',
      socketId: socket.id
    });

    console.log(`User registered: ${userName} (${phoneNumber})`);
    
    // Broadcast updated user list
    io.emit('users-list', Array.from(users.values()));
    
    socket.emit('registered', { success: true, userId: socket.id });
  });

  // User initiates call
  socket.on('call-request', (data) => {
    const { targetPhoneNumber, offer } = data;
    const caller = users.get(socket.id);

    // Find target user by phone number
    let targetUser = null;
    for (let [key, user] of users) {
      if (user.phoneNumber === targetPhoneNumber) {
        targetUser = user;
        break;
      }
    }

    if (!targetUser) {
      socket.emit('call-error', { message: 'User not found' });
      return;
    }

    if (targetUser.status !== 'available') {
      socket.emit('call-error', { message: 'User is busy' });
      return;
    }

    // Update statuses
    caller.status = 'calling';
    targetUser.status = 'ringing';

    // Send call to target user
    io.to(targetUser.socketId).emit('incoming-call', {
      from: caller.userName,
      fromPhoneNumber: caller.phoneNumber,
      fromId: caller.id,
      offer: offer
    });

    // Notify caller
    socket.emit('call-initiated', {
      targetName: targetUser.userName,
      targetId: targetUser.id
    });

    // Update user list
    io.emit('users-list', Array.from(users.values()));
  });

  // Target user answers call
  socket.on('answer-call', (data) => {
    const { callerId, answer } = data;
    const answerer = users.get(socket.id);

    if (!users.has(callerId)) {
      socket.emit('call-error', { message: 'Caller not found' });
      return;
    }

    const caller = users.get(callerId);
    answerer.status = 'in-call';
    caller.status = 'in-call';

    // Send answer to caller
    io.to(caller.socketId).emit('call-answered', {
      answer: answer,
      answererName: answerer.userName
    });

    // Notify answerer
    socket.emit('call-connected', {
      callerName: caller.userName
    });

    // Update user list
    io.emit('users-list', Array.from(users.values()));
  });

  // ICE candidate exchange
  socket.on('ice-candidate', (data) => {
    const { targetId, candidate } = data;
    
    if (users.has(targetId)) {
      io.to(users.get(targetId).socketId).emit('ice-candidate', {
        candidate: candidate,
        from: socket.id
      });
    }
  });

  // Reject call
  socket.on('reject-call', (data) => {
    const { callerId } = data;
    const rejecter = users.get(socket.id);

    if (users.has(callerId)) {
      rejecter.status = 'available';
      io.to(users.get(callerId).socketId).emit('call-rejected', {
        message: `${rejecter.userName} rejected your call`
      });
      users.get(callerId).status = 'available';
    }

    // Update user list
    io.emit('users-list', Array.from(users.values()));
  });

  // End call
  socket.on('end-call', (data) => {
    const { targetId } = data;
    const user = users.get(socket.id);

    if (user) {
      user.status = 'available';
    }

    if (users.has(targetId)) {
      users.get(targetId).status = 'available';
      io.to(users.get(targetId).socketId).emit('call-ended', {
        message: 'Call ended by other party'
      });
    }

    // Update user list
    io.emit('users-list', Array.from(users.values()));
  });

  // User disconnects
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`User disconnected: ${user.userName}`);
      users.delete(socket.id);
    }

    // Broadcast updated user list
    io.emit('users-list', Array.from(users.values()));
  });

  // Get online users
  socket.on('get-users', () => {
    socket.emit('users-list', Array.from(users.values()));
  });
});

// REST API endpoints
app.get('/api/users', (req, res) => {
  res.json(Array.from(users.values()));
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    connectedUsers: users.size,
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('VoIP Server running on port', PORT);
});

