// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rooms = {}; // 방 정보 저장: { roomName: { password, admin, muted, notice } }
const users = {}; // socket.id → { nickname, room }

app.use(express.static(join(__dirname, "public")));

app.get("/:room", (req, res) => {
  res.sendFile(join(__dirname, "public/index.html"));
});

io.on("connection", (socket) => {
  socket.on("join", ({ room, nickname, isFirst, password }) => {
    if (!rooms[room]) {
      if (isFirst) {
        rooms[room] = { password, admin: socket.id, muted: [], notice: "" };
        socket.isAdmin = true;
        socket.emit("system", "✅ 방 생성 완료 (관리자 권한)");
      } else {
        socket.emit("system", "❌ 방이 존재하지 않습니다.");
        return;
      }
    } else {
      if (isFirst) {
        socket.emit("system", "❌ 이미 존재하는 방입니다.");
        return;
      }
      socket.isAdmin = false;
    }

    socket.join(room);
    socket.nickname = nickname;
    socket.room = room;
    users[socket.id] = { nickname, room };

    io.to(room).emit("notice", rooms[room].notice);
    updateUserList(room);
  });

  socket.on("chat", (msg) => {
    const { room, nickname } = users[socket.id] || {};
    if (!room || rooms[room].muted.includes(socket.id)) return;
    io.to(room).emit("chat", { from: nickname, msg });
  });

  socket.on("notice", (notice) => {
    const { room } = users[socket.id] || {};
    if (room && rooms[room].admin === socket.id) {
      rooms[room].notice = notice;
      io.to(room).emit("notice", notice);
    }
  });

  socket.on("mute", (targetId) => {
    const { room } = users[socket.id] || {};
    if (room && rooms[room].admin === socket.id) {
      rooms[room].muted.push(targetId);
      io.to(targetId).emit("system", "⛔ 채팅 금지되었습니다.");
    }
  });

  socket.on("whisper", ({ to, msg }) => {
    for (let id in users) {
      if (users[id].nickname === to) {
        io.to(id).emit("whisper", { from: socket.nickname, msg });
        break;
      }
    }
  });

  socket.on("disconnect", () => {
    const { room } = users[socket.id] || {};
    if (room) {
      delete users[socket.id];
      updateUserList(room);
    }
  });

  function updateUserList(room) {
    const list = Object.entries(users)
      .filter(([_, u]) => u.room === room)
      .map(([id, u]) => ({ id, nickname: u.nickname }));
    io.to(room).emit("users", list);
  }
});

server.listen(PORT, () => {
  console.log("✅ Server running on port " + PORT);
});
