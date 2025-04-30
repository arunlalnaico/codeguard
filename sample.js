// Sample code with security and compliance issues for testing CodeGuard AI

// SQL Injection vulnerability (SEC001)
function getUserData(userId) {
    const query = `SELECT * FROM users WHERE id = ${userId}`;
    return db.executeQuery(query);
}

// XSS vulnerability (SEC002)
function displayUserComment(comment) {
    document.getElementById('comments').innerHTML = comment;
}

// Hardcoded secrets (SEC003)
const apiKey = "1a2b3c4d5e6f7g8h9i0j";
const dbPassword = "super_secure_password";

// IDOR vulnerability (SEC004)
function getProfile(req, res) {
    const profileId = req.params.id;
    return User.findById(profileId);
}

// Weak cryptography (SEC005)
const hash = crypto.createHash('md5').update(password).digest('hex');

// GDPR/HIPAA issues - unencrypted personal data (COMP001)
function storeUserData(userData) {
    database.users.create({
        name: userData.name,
        email: userData.email,
        ssn: userData.ssn,
        dob: userData.dateOfBirth
    });
}

// Missing data deletion mechanism (COMP002)
function createUserAccount(userData) {
    database.accounts.create({
        userId: userData.id,
        level: userData.accessLevel,
        createdAt: new Date()
    });
}

// Inadequate logging (COMP003)
function adminLogin(username, password) {
    if (users[username] && users[username].password === password) {
        return generateToken(username);
    }
    return null;
}

// Insecure authentication (COMP004)
function authenticateUser(req, res) {
    const token = req.headers.authorization.split('Basic ')[1];
    const credentials = Buffer.from(token, 'base64').toString();
    const [username, password] = credentials.split(':');
    
    if (username === 'admin' && password === 'password') {
        return true;
    }
    return false;
}

// Health data exposure (COMP005)
function getPatientRecords(patientId) {
    return database.query(`
        SELECT * FROM medical_records 
        WHERE patient_id = ${patientId}
    `);
}