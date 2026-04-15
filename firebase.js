// ============================================
// SERVICOJA — FIREBASE CORE
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// CONFIGURAÇÃO DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDgmh5UctN25QCZoNoNctbuCbwMUF97HX4",
  authDomain: "servicoja-e1f49.firebaseapp.com",
  projectId: "servicoja-e1f49",
  storageBucket: "servicoja-e1f49.firebasestorage.app",
  messagingSenderId: "874413426529",
  appId: "1:874413426529:web:9891d44afd9ef1750e6720",
  measurementId: "G-1KE1FC2L4Z"
};

// INICIALIZAR
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// ============================================
// AUTENTICAÇÃO
// ============================================

// Cadastrar novo usuário
export async function cadastrarUsuario(email, senha, dados) {
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  await setDoc(doc(db, "usuarios", cred.user.uid), {
    ...dados,
    uid: cred.user.uid,
    email,
    criadoEm: serverTimestamp()
  });
  return cred.user;
}

// Login com email e senha
export async function loginEmail(email, senha) {
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  return cred.user;
}

// Login com Google
export async function loginGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  const userRef = doc(db, "usuarios", cred.user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid: cred.user.uid,
      nome: cred.user.displayName,
      email: cred.user.email,
      foto: cred.user.photoURL,
      tipo: "cliente",
      criadoEm: serverTimestamp()
    });
  }
  return cred.user;
}

// Recuperar senha
export async function recuperarSenha(email) {
  await sendPasswordResetEmail(auth, email);
}

// Logout
export async function logout() {
  await signOut(auth);
  window.location.href = "login.html";
}

// Observar estado do login
export function observarLogin(callback) {
  return onAuthStateChanged(auth, callback);
}

// Pegar usuário atual
export function usuarioAtual() {
  return auth.currentUser;
}

// ============================================
// USUÁRIOS
// ============================================

// Salvar dados do usuário
export async function salvarUsuario(uid, dados) {
  await setDoc(doc(db, "usuarios", uid), dados, { merge: true });
}

// Buscar dados do usuário
export async function buscarUsuario(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Buscar profissionais por categoria
export async function buscarProfissionais(categoria) {
  const q = query(
    collection(db, "usuarios"),
    where("tipo", "==", "profissional"),
    where("aprovado", "==", true),
    where("categorias", "array-contains", categoria)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ============================================
// PEDIDOS
// ============================================

// Publicar pedido
export async function publicarPedido(dados) {
  const user = usuarioAtual();
  const ref = await addDoc(collection(db, "pedidos"), {
    ...dados,
    clienteId: user.uid,
    status: "aberto",
    interessados: [],
    aceitos: [],
    criadoEm: serverTimestamp()
  });
  return ref.id;
}

// Buscar pedidos do cliente
export async function buscarMeusPedidos() {
  const user = usuarioAtual();
  const q = query(
    collection(db, "pedidos"),
    where("clienteId", "==", user.uid),
    orderBy("criadoEm", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Buscar pedidos disponíveis para profissional (por categoria)
export async function buscarPedidosDisponiveis(categorias) {
  const q = query(
    collection(db, "pedidos"),
    where("status", "==", "aberto"),
    where("categoria", "in", categorias),
    orderBy("criadoEm", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Profissional demonstra interesse
export async function demonstrarInteresse(pedidoId) {
  const user = usuarioAtual();
  const userData = await buscarUsuario(user.uid);
  await addDoc(collection(db, "pedidos", pedidoId, "interessados"), {
    profissionalId: user.uid,
    nome: userData.nome,
    foto: userData.foto || "",
    avaliacao: userData.avaliacao || 0,
    aprovadoIA: userData.aprovadoIA || false,
    categorias: userData.categorias || [],
    criadoEm: serverTimestamp()
  });
  // Criar notificação para o cliente
  const pedido = await getDoc(doc(db, "pedidos", pedidoId));
  await criarNotificacao(pedido.data().clienteId, {
    tipo: "interesse",
    titulo: `${userData.nome} tem interesse no seu pedido`,
    descricao: `Veja o perfil e decida se aceita.`,
    pedidoId,
    profissionalId: user.uid,
    lida: false
  });
}

// Buscar interessados de um pedido
export async function buscarInteressados(pedidoId) {
  const snap = await getDocs(collection(db, "pedidos", pedidoId, "interessados"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Cliente aceita profissional
export async function aceitarProfissional(pedidoId, profissionalId) {
  const user = usuarioAtual();
  // Criar sala de chat
  const chatId = await criarChat(pedidoId, user.uid, profissionalId);
  // Criar notificação para profissional
  const clienteData = await buscarUsuario(user.uid);
  await criarNotificacao(profissionalId, {
    tipo: "aceite",
    titulo: `${clienteData.nome} aceitou seu interesse!`,
    descricao: "Agora você pode enviar seu orçamento.",
    pedidoId,
    chatId,
    lida: false
  });
  return chatId;
}

// Atualizar status do pedido
export async function atualizarStatusPedido(pedidoId, status) {
  await updateDoc(doc(db, "pedidos", pedidoId), { status });
}

// Deletar pedido
export async function deletarPedido(pedidoId) {
  await deleteDoc(doc(db, "pedidos", pedidoId));
}

// Observar pedidos em tempo real
export function observarPedidos(categorias, callback) {
  const q = query(
    collection(db, "pedidos"),
    where("status", "==", "aberto"),
    orderBy("criadoEm", "desc")
  );
  return onSnapshot(q, snap => {
    const pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(pedidos);
  });
}

// ============================================
// CHAT
// ============================================

// Criar sala de chat
export async function criarChat(pedidoId, clienteId, profissionalId) {
  const chatRef = await addDoc(collection(db, "chats"), {
    pedidoId,
    clienteId,
    profissionalId,
    participantes: [clienteId, profissionalId],
    criadoEm: serverTimestamp(),
    ultimaMensagem: "",
    ultimaHora: serverTimestamp()
  });
  return chatRef.id;
}

// Enviar mensagem
export async function enviarMensagem(chatId, texto, tipo = "texto", url = null) {
  const user = usuarioAtual();
  await addDoc(collection(db, "chats", chatId, "mensagens"), {
    remetenteId: user.uid,
    texto,
    tipo,
    url,
    lida: false,
    criadoEm: serverTimestamp()
  });
  await updateDoc(doc(db, "chats", chatId), {
    ultimaMensagem: tipo === "foto" ? "📷 Foto" : texto,
    ultimaHora: serverTimestamp()
  });
}

// Observar mensagens em tempo real
export function observarMensagens(chatId, callback) {
  const q = query(
    collection(db, "chats", chatId, "mensagens"),
    orderBy("criadoEm", "asc")
  );
  return onSnapshot(q, snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(msgs);
  });
}

// Buscar chats do usuário
export function observarChats(callback) {
  const user = usuarioAtual();
  const q = query(
    collection(db, "chats"),
    where("participantes", "array-contains", user.uid),
    orderBy("ultimaHora", "desc")
  );
  return onSnapshot(q, snap => {
    const chats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(chats);
  });
}

// ============================================
// NOTIFICAÇÕES
// ============================================

// Criar notificação
export async function criarNotificacao(uid, dados) {
  await addDoc(collection(db, "usuarios", uid, "notificacoes"), {
    ...dados,
    lida: false,
    criadoEm: serverTimestamp()
  });
}

// Observar notificações em tempo real
export function observarNotificacoes(callback) {
  const user = usuarioAtual();
  const q = query(
    collection(db, "usuarios", user.uid, "notificacoes"),
    orderBy("criadoEm", "desc")
  );
  return onSnapshot(q, snap => {
    const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(notifs);
  });
}

// Marcar notificação como lida
export async function marcarNotificacaoLida(notifId) {
  const user = usuarioAtual();
  await updateDoc(doc(db, "usuarios", user.uid, "notificacoes", notifId), { lida: true });
}

// ============================================
// AVALIAÇÕES
// ============================================

// Enviar avaliação
export async function enviarAvaliacao(profissionalId, pedidoId, nota, comentario) {
  const user = usuarioAtual();
  const clienteData = await buscarUsuario(user.uid);
  await addDoc(collection(db, "usuarios", profissionalId, "avaliacoes"), {
    clienteId: user.uid,
    clienteNome: clienteData.nome,
    pedidoId,
    nota,
    comentario,
    criadoEm: serverTimestamp()
  });
  // Atualizar média de avaliação
  const snap = await getDocs(collection(db, "usuarios", profissionalId, "avaliacoes"));
  const avaliacoes = snap.docs.map(d => d.data().nota);
  const media = avaliacoes.reduce((a, b) => a + b, 0) / avaliacoes.length;
  await updateDoc(doc(db, "usuarios", profissionalId), {
    avaliacao: parseFloat(media.toFixed(1)),
    totalAvaliacoes: avaliacoes.length
  });
}

// ============================================
// UPLOAD DE FOTOS
// ============================================

// Upload de imagem
export async function uploadFoto(arquivo, caminho) {
  const storageRef = ref(storage, caminho);
  await uploadBytes(storageRef, arquivo);
  const url = await getDownloadURL(storageRef);
  return url;
}

// Upload foto de perfil
export async function uploadFotoPerfil(arquivo) {
  const user = usuarioAtual();
  const url = await uploadFoto(arquivo, `perfis/${user.uid}/foto`);
  await updateDoc(doc(db, "usuarios", user.uid), { foto: url });
  return url;
}

// Upload foto de portfólio
export async function uploadFotoPortfolio(arquivo, index) {
  const user = usuarioAtual();
  const url = await uploadFoto(arquivo, `portfolio/${user.uid}/foto_${index}`);
  return url;
}

// Upload foto de pedido
export async function uploadFotoPedido(arquivo, pedidoId, index) {
  const url = await uploadFoto(arquivo, `pedidos/${pedidoId}/foto_${index}`);
  return url;
}

// Upload foto de chat
export async function uploadFotoChat(arquivo, chatId) {
  const url = await uploadFoto(arquivo, `chats/${chatId}/${Date.now()}`);
  return url;
}

// Exportar instâncias
export { auth, db, storage };
