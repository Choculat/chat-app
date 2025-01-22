const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Store rooms information
let rooms = {};

// List of random words to generate user names
const words = [
    "milk", "tree", "apple", "blue", "sky", "cloud", "fire", "water", "green", "stone",
    "mountain", "moon", "star", "river", "ocean", "sand", "rock", "wood", "leaf", "rain",
    "sun", "earth", "breeze", "snow", "storm", "desert", "palm", "vine", "flame", "ice",
    "plum", "grass", "wild", "berry", "moss", "dust", "clouds", "night", "day", "light",
    "shade", "dark", "heat", "frost", "wind", "branch", "blossom", "thunder", "flame", "lava",
    "ash", "petal", "fern", "pine", "cactus", "bloom", "twig", "seashell", "pebble", "lava",
    "glow", "spark", "mist", "leafy", "flame", "stone", "crystal", "shimmer", "blueberry",
    "candy", "caramel", "pear", "peach", "nectar", "maple", "autumn", "frosty", "tulip",
    "cherry", "blaze", "ivy", "harvest", "sage", "honey", "pumpkin", "coral", "applejack",
    "butterfly", "raven", "tiger", "breeze", "seashell", "violet", "lavender", "marble",
    "twilight", "flicker", "whisper", "ember", "pomegranate", "lavender", "dusty", "violet",
    "moonlight", "pineapple", "twirl", "driftwood", "mango", "misty", "stream", "sunset",
    "galaxy", "pulse", "rainbow", "aloe", "fern", "sunflower", "rosemary", "cosmos", "sugar"
];

// Function to generate a random two-word name
function generateRandomName() {
    const randomIndex1 = Math.floor(Math.random() * words.length);
    const randomIndex2 = Math.floor(Math.random() * words.length);
    return `${words[randomIndex1]}-${words[randomIndex2]}`;
}

// Serve the static files in the 'public' folder
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true })); // Parse POST request bodies

// Index page: where rooms are listed and created
app.get('/', (req, res) => {
    // Filter only public rooms for the index list
    const roomList = Object.keys(rooms).map(roomToken => ({
        token: roomToken,
        usersCount: rooms[roomToken].users.length,
        isPrivate: rooms[roomToken].isPrivate || false
    })).filter(room => !room.isPrivate); // Exclude private rooms

    res.render('index.ejs', { rooms: roomList });
});

// Create a new room with a token and add the user to it
app.post('/create-room', (req, res) => {
    const roomToken = uuidv4(); // Create a new unique room token
    const isPrivate = req.body.isPrivate === 'on'; // Check if the private option is checked

    rooms[roomToken] = {
        users: [],
        isPrivate: isPrivate
    }; // Initialize an empty user list for the room and set its privacy status

    res.redirect(`/room/${roomToken}`);
});

// Join a room using the room token
app.get('/room/:token', (req, res) => {
    const roomToken = req.params.token;
    if (!rooms[roomToken]) {
        return res.status(404).send('Room not found');
    }
    res.render('room.ejs', { token: roomToken });
});

// Join a private room by entering room ID
app.post('/join-private-room', (req, res) => {
    const roomToken = req.body.roomId; // Assuming you get roomId from the user input
    if (!rooms[roomToken] || !rooms[roomToken].isPrivate) {
        // Send an error message if the room is invalid or not private
        return res.render('index.ejs', {
            rooms: Object.keys(rooms).map(roomToken => ({
                token: roomToken,
                usersCount: rooms[roomToken].users.length,
                isPrivate: rooms[roomToken].isPrivate || false
            })).filter(room => !room.isPrivate),
            errorMessage: 'Private room not found or invalid Room ID!'
        });
    }
    res.redirect(`/room/${roomToken}`);
});


io.on('connection', (socket) => {
    // Get the user's IP address from the X-Forwarded-For header if it's available.
    // Otherwise, fallback to the connection's remote address.
    const ip = socket.request.headers['x-forwarded-for'] || socket.request.connection.remoteAddress;

    const userName = generateRandomName(); // Generate random user name
    let currentRoom = null;

    socket.on('join-room', (roomToken) => {
        if (!rooms[roomToken]) {
            return socket.emit('error', 'Room not found');
        }

        currentRoom = roomToken;
        socket.join(roomToken);

        // Add user to the room with their IP and random name
        rooms[roomToken].users.push({ id: socket.id, name: userName, ip: ip });

        // Broadcast the user list and number of users
        io.to(roomToken).emit('user-list', rooms[roomToken].users);
        io.to(roomToken).emit('user-connected', { id: socket.id, name: userName, ip: ip });

        // If the room is private, notify the user
        if (rooms[roomToken].isPrivate) {
            socket.emit('private-room', { isPrivate: true });
        }
    });

    // Handle chat messages
    socket.on('chat-message', (msg, roomToken) => {
        io.to(roomToken).emit('chat-message', { msg, id: socket.id, name: userName });
    });

    // Handle user disconnection
    socket.on('disconnect', () => {
        if (currentRoom) {
            // Remove the user from the room's user list
            rooms[currentRoom].users = rooms[currentRoom].users.filter(user => user.id !== socket.id);

            // If there are no users left in the room, delete the room
            if (rooms[currentRoom].users.length === 0) {
                delete rooms[currentRoom];
                console.log(`Room ${currentRoom} deleted as all users have left.`);
            } else {
                // Broadcast the updated user list
                io.to(currentRoom).emit('user-list', rooms[currentRoom].users);
            }

            // Emit to the room that the user has disconnected
            io.to(currentRoom).emit('user-disconnected', socket.id);
        }
    });
});


// Start the server
server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
