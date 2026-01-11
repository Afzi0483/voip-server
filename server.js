const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// Enable CORS for all origins
app.use(cors({
  origin: '*',
  credentials: true
}));

const server = http.createServer(app);

// Socket.io with CORS enabled
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Basic route
app.get('/', (req, res) => {
  res.send('VoIP Server is running');
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('call', (data) => {
    console.log(`Call from ${socket.id} to ${data.to}`);
    io.to(data.to).emit('incoming-call', { from: socket.id });
  });

  socket.on('accept-call', (data) => {
    console.log(`${socket.id} accepted call from ${data.to}`);
    io.to(data.to).emit('call-accepted', { from: socket.id });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`VoIP Server running on port ${PORT}`);
});
