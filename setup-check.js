#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Sparkle Clean Voicebot - Setup Verification\n');

// Check if .env file exists
function checkEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        console.log('✅ .env file found');

        // Read and parse .env file
        const envContent = fs.readFileSync(envPath, 'utf8');
        const hasDeepgram = envContent.includes('DEEPGRAM_API_KEY=') && !envContent.includes('your_deepgram_api_key_here');
        const hasOpenRouter = envContent.includes('OPENROUTER_API_KEY=') && !envContent.includes('your_openrouter_api_key_here');
        const hasDbUrl = envContent.includes('DB_URL=') && !envContent.includes('your_dataverse_api_url_here');

        if (hasDeepgram) {
            console.log('✅ Deepgram API key configured');
        } else {
            console.log('❌ Deepgram API key not configured');
        }

        if (hasOpenRouter) {
            console.log('✅ OpenRouter API key configured');
        } else {
            console.log('❌ OpenRouter API key not configured');
        }

        if (hasDbUrl) {
            console.log('✅ Database URL configured');
        } else {
            console.log('⚠️  Database URL not configured (optional for testing)');
        }

        return hasDeepgram && hasOpenRouter;
    } else {
        console.log('❌ .env file not found');
        console.log('   Run: cp .env.example .env');
        return false;
    }
}

// Check if all required files exist
function checkRequiredFiles() {
    const requiredFiles = [
        'server.js',
        'package.json',
        'public/index.html',
        'public/style.css',
        'public/app.js'
    ];

    let allFilesExist = true;

    requiredFiles.forEach(file => {
        if (fs.existsSync(path.join(__dirname, file))) {
            console.log(`✅ ${file} exists`);
        } else {
            console.log(`❌ ${file} missing`);
            allFilesExist = false;
        }
    });

    return allFilesExist;
}

// Check if node_modules exists
function checkDependencies() {
    if (fs.existsSync(path.join(__dirname, 'node_modules'))) {
        console.log('✅ Dependencies installed');
        return true;
    } else {
        console.log('❌ Dependencies not installed');
        console.log('   Run: npm install');
        return false;
    }
}

// Check Node.js version
function checkNodeVersion() {
    const version = process.version;
    const major = parseInt(version.split('.')[0].substring(1));

    if (major >= 14) {
        console.log(`✅ Node.js version ${version} (compatible)`);
        return true;
    } else {
        console.log(`❌ Node.js version ${version} (requires v14+)`);
        return false;
    }
}

// Main setup check
function runSetupCheck() {
    console.log('📁 Checking required files...');
    const filesOk = checkRequiredFiles();

    console.log('\n📦 Checking dependencies...');
    const depsOk = checkDependencies();

    console.log('\n🔧 Checking Node.js version...');
    const nodeOk = checkNodeVersion();

    console.log('\n🔑 Checking environment configuration...');
    const envOk = checkEnvFile();

    console.log('\n' + '='.repeat(50));

    if (filesOk && depsOk && nodeOk && envOk) {
        console.log('🎉 Setup verification passed! You can now run:');
        console.log('   npm start');
        console.log('\n🌐 Then visit: http://localhost:3000');
        console.log('\n📋 Features available:');
        console.log('   ✅ Voice interaction with cleaning booking assistant');
        console.log('   ✅ Automatic visit creation when booking is complete');
        console.log('   ✅ Integration with Dataverse (if DB_URL configured)');
    } else {
        console.log('❌ Setup verification failed. Please fix the issues above.');

        if (!envOk) {
            console.log('\n📝 Next steps:');
            console.log('1. Copy the environment template: cp .env.example .env');
            console.log('2. Get your Deepgram API key: https://console.deepgram.com/');
            console.log('3. Get your OpenRouter API key: https://openrouter.ai/keys');
            console.log('4. Add your Dataverse/API URL to DB_URL (optional)');
            console.log('5. Add your API keys to the .env file');
            console.log('6. Run this check again: node setup-check.js');
        }
    }

    console.log('='.repeat(50));
}

runSetupCheck();