const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { Client } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Config PostgreSQL (Railway injecte automatiquement DATABASE_URL)
const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/primaire',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
client.connect();

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-key-primaire-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Vérifier si l'admin existe, sinon le créer
async function initAdmin() {
  try {
    const res = await client.query('SELECT * FROM users WHERE role = $1', ['admin']);
    if (res.rows.length === 0) {
      const hashed = await bcrypt.hash('admin123', 10);
      await client.query(
        'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)',
        ['admin@education.ci', hashed, 'Administrateur', 'admin']
      );
      console.log('✅ Compte admin créé : admin@education.ci / admin123');
    }
  } catch (e) {
    console.error('Erreur init admin:', e);
  }
}

// Créer les tables si elles n'existent pas
client.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    role TEXT
  );
  CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    matricule TEXT,
    full_name TEXT,
    birth_date DATE,
    birth_place TEXT,
    class_name TEXT,
    school TEXT,
    iep TEXT,
    photo_url TEXT,
    acte_url TEXT
  );
`).then(() => initAdmin()).catch(console.error);

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (user && await bcrypt.compare(password, user.password)) {
      req.session.user = user;
      return res.redirect(user.role === 'admin' ? '/admin' : '/guest');
    }
    res.render('login', { error: 'Identifiants incorrects' });
  } catch (e) {
    res.render('login', { error: 'Erreur serveur' });
  }
});

app.get('/admin', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/login');
  const students = (await client.query('SELECT * FROM students')).rows;
  res.render('admin', { students });
});

app.get('/guest', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('guest');
});

app.post('/guest', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { iep, school, className, fullName, birthDate, birthPlace, matricule } = req.body;
  await client.query(
    `INSERT INTO students (matricule, full_name, birth_date, birth_place, class_name, school, iep)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [matricule, fullName, birthDate, birthPlace, className, school, iep]
  );
  res.send('<h3>✅ Élève enregistré avec succès !</h3><p><a href="/guest">← Retour</a></p>');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});