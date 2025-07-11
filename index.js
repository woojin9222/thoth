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

const rooms = {}; // 방 목록: roomName → { password, admin, subadmins: [], muted: [], notice: "" }
const users = {}; // 유저 목록: socket.id → { nickname, room, role }

app.use(express.static(join(__dirname, "public")));

app.get("/:room", (req, res) => {
  res.sendFile(join(__dirname, "public/index.html"));
});

io.on("connection", (socket) => {
  socket.on("join", ({ room, nickname, isFirst, password }) => {
    if (!rooms[room]) {
      if (isFirst) {
        rooms[room] = {
          password,
          admin: socket.id,
          subadmins: [],
          muted: [],
          notice: "",
        };
        users[socket.id] = { nickname, room, role: "admin" };
        socket.emit("system", "✅ 방 생성됨 (관리자)");
      } else {
        socket.emit("system", "❌ 방이 존재하지 않습니다.");
        return;
      }
    } else {
      if (isFirst) {
        socket.emit("system", "❌ 이미 존재하는 방입니다.");
        return;
      }
      const isSub = rooms[room].subadmins.includes(socket.id);
      const role =
        socket.id === rooms[room].admin ? "admin" : isSub ? "subadmin" : "user";
      users[socket.id] = { nickname, room, role };
    }

    socket.join(room);
    socket.nickname = nickname;
    socket.room = room;

    io.to(room).emit("notice", rooms[room].notice);
    updateUserList(room);
  });

  socket.on("chat", (msg) => {
    const user = users[socket.id];
    if (!user || rooms[user.room].muted.includes(socket.id)) return;
    io.to(user.room).emit("chat", { from: user.nickname, msg });
  });

  socket.on("notice", (html) => {
    const user = users[socket.id];
    if (user && user.role === "admin") {
      rooms[user.room].notice = html;
      io.to(user.room).emit("notice", html);
    }
  });

  socket.on("mute", (targetId) => {
    const user = users[socket.id];
    if (!user) return;
    const room = rooms[user.room];
    if (user.role === "admin" || user.role === "subadmin") {
      room.muted.push(targetId);
      io.to(targetId).emit("system", "⛔ 채팅 금지되었습니다.");
    }
  });

  socket.on("setSubadmin", (targetId) => {
    const user = users[socket.id];
    if (!user || user.role !== "admin") return;
    if (!rooms[user.room].subadmins.includes(targetId)) {
      rooms[user.room].subadmins.push(targetId);
      if (users[targetId]) users[targetId].role = "subadmin";
      updateUserList(user.room);
      io.to(targetId).emit("system", "🛡️ 부관리자로 지정되었습니다.");
    }
  });

  socket.on("whisper", ({ to, msg }) => {
    for (let id in users) {
      if (users[id].nickname === to) {
        io.to(id).emit("whisper", { from: users[socket.id].nickname, msg });
        break;
      }
    }
  });

  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (user) {
      delete users[socket.id];
      updateUserList(user.room);
    }
  });

  function updateUserList(room) {
    const list = Object.entries(users)
      .filter(([_, u]) => u.room === room)
      .map(([id, u]) => {
        return { id, nickname: u.nickname, role: u.role || "user" };
      });
    io.to(room).emit("users", list);
  }
});

server.listen(PORT, () => {
  console.log("✅ Server running on port " + PORT);
});
