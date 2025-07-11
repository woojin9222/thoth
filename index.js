const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public")); // static files

// ✅ 채널별 라우팅 처리
app.get("/:room", (req, res) => {
  const room = req.params.room;
  if (room === "socket.io") return; // socket.io 예외
  res.sendFile(path.join(__dirname, "public", "channel.html"));
});

// 🏠 메인 페이지
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
const rooms = {};
const channels = new Set();
const roomOwners = {};
const roomPasswords = {};

io.on("connection", (socket) => {
  socket.on("createChannel", (name) => {
    channels.add(name);
    io.emit("channelList", Array.from(channels));
  });

  socket.on("getChannels", () => {
    socket.emit("channelList", Array.from(channels));
  });

  socket.on("join", ({ room, nickname, password }) => {
    socket.join(room);
    socket.room = room;
    socket.nickname = nickname;

    if (!rooms[room]) rooms[room] = [];
    if (!rooms[room].some((u) => u.id === socket.id)) {
      rooms[room].push({ id: socket.id, nickname });
    }

    if (!channels.has(room)) channels.add(room);

    // ✅ 관리자 설정 여부 검사
    if (!roomPasswords[room]) {
      // 최초 입장자
      roomPasswords[room] = password;
      roomOwners[room] = socket.id;
      socket.emit("adminGranted");
    } else if (password && roomPasswords[room] !== password) {
      socket.emit("adminDenied");
    }

    io.emit("channelList", Array.from(channels));
    io.to(room).emit("userList", rooms[room]);
  });

  socket.on("loginAdmin", ({ room, password }) => {
    if (roomPasswords[room] === password) {
      roomOwners[room] = socket.id;
      socket.emit("adminGranted");
    } else {
      socket.emit("adminDenied");
    }
  });

  socket.on("message", (msg) => {
    io.to(socket.room).emit("message", {
      nickname: socket.nickname,
      text: msg,
    });
  });

  socket.on("privateMessage", ({ to, from, message }) => {
    const target = [...io.sockets.sockets.values()].find(
      (s) => s.nickname === to,
    );
    if (target) {
      target.emit("privateMessage", { from, message });
    }
  });

  socket.on("muteUser", ({ to }) => {
    if (roomOwners[socket.room] === socket.id) {
      const target = [...io.sockets.sockets.values()].find(
        (s) => s.nickname === to,
      );
      if (target) target.emit("muted");
    }
  });

  socket.on("disconnect", () => {
    const room = socket.room;
    if (rooms[room]) {
      rooms[room] = rooms[room].filter((u) => u.id !== socket.id);
      io.to(room).emit("userList", rooms[room]);
    }
  });
});
const PORT = process.env.PORT || 3000; // ✅ Render 포트 사용
server.listen(PORT, () => {
  console.log("✅ 서버 실행 중 on " + PORT);
});
