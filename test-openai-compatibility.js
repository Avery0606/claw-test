#!/usr/bin/env node

/**
 * OpenAI API 兼容性测试脚本
 *
 * 用法: node test-openai-compatibility.js <baseUrl> [apiKey] [model]
 *
 * 示例:
 *   node test-openai-compatibility.js https://api.example.com/v1
 *   node test-openai-compatibility.js https://api.example.com/v1 sk-xxx
 *   node test-openai-compatibility.js https://api.example.com/v1 sk-xxx gpt-4
 *   node test-openai-compatibility.js https://api.example.com/v1 "" "claude-3-haiku"  # 指定模型不带key
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const args = process.argv.slice(2);

if (args.length < 1) {
  console.log('用法: node test-openai-compatibility.js <baseUrl> [apiKey] [model]');
  console.log('');
  console.log('参数:');
  console.log('  baseUrl  - API 的基础 URL (例如: https://api.example.com/v1)');
  console.log('  apiKey   - (可选) API Key，用于认证测试');
  console.log('  model    - (可选) 使用的模型名称');
  console.log('');
  console.log('示例:');
  console.log('  node test-openai-compatibility.js https://api.example.com/v1');
  console.log('  node test-openai-compatibility.js https://api.example.com/v1 sk-xxx');
  console.log('  node test-openai-compatibility.js https://api.example.com/v1 sk-xxx gpt-4');
  console.log('  node test-openai-compatibility.js https://api.example.com/v1 "" claude-3-haiku');
  process.exit(1);
}

const baseUrl = args[0].replace(/\/$/, ''); // 移除末尾的斜杠
const apiKey = args[1] || '';
const model = args[2] || 'gpt-3.5-turbo';

// OpenAI API 兼容的端点
const endpoints = {
  chatCompletions: '/chat/completions',
  models: '/models',
  embeddings: '/embeddings'
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(message, type = 'info') {
  const prefix = {
    success: '[✓]',
    error: '[✗]',
    warn: '[!]',
    info: '[i]'
  };
  console.log(`${prefix[type] || prefix.info} ${message}`);
}

function makeRequest(endpoint, method = 'POST', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(`${baseUrl}${endpoint}`);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 30000
    };

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testEndpoint(name, endpoint, method = 'POST', data = null, headers = {}) {
  log(`测试 ${name}...`, 'info');
  try {
    const response = await makeRequest(endpoint, method, data, headers);
    const isSuccess = response.status >= 200 && response.status < 300;

    if (isSuccess) {
      log(`${name} ✓ (HTTP ${response.status})`, 'success');
      return { success: true, status: response.status, data: response.body };
    } else {
      log(`${name} ✗ (HTTP ${response.status})`, 'error');
      return { success: false, status: response.status, data: response.body };
    }
  } catch (error) {
    log(`${name} ✗ - ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log(colorize('\n🤖 OpenAI API 兼容性测试', 'cyan'));
  console.log(colorize('=' .repeat(50), 'cyan'));
  console.log(`Base URL: ${baseUrl}`);
  console.log(`API Key: ${apiKey ? '已提供 ✓' : '未提供 (某些测试可能失败)'}`);
  console.log(`Model: ${model}`);
  console.log('');

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // 1. 测试 Models 端点 (GET)
  if (apiKey) {
    const modelResult = await testEndpoint(
      'Models 端点 (GET /models)',
      endpoints.models,
      'GET',
      null,
      { 'Authorization': `Bearer ${apiKey}` }
    );
    results.tests.push({ name: 'Models 端点', ...modelResult });
    if (modelResult.success) results.passed++; else results.failed++;

    // 检查返回格式
    if (modelResult.success && modelResult.data) {
      const hasCorrectFormat = modelResult.data.data && Array.isArray(modelResult.data.data);
      if (hasCorrectFormat) {
        log('返回格式符合 OpenAI 规范 ✓', 'success');
      } else {
        log('返回格式不符合 OpenAI 规范 (缺少 data 数组)', 'warn');
      }
    }
  } else {
    log('跳过 Models 测试 (需要 API Key)', 'warn');
  }

  console.log('');

  // 2. 测试 Chat Completions 端点 (POST)
  const chatData = {
    model: model,
    messages: [
      { role: 'user', content: 'Hello' }
    ],
    max_tokens: 10
  };

  const headers = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const chatResult = await testEndpoint(
    'Chat Completions 端点 (POST /chat/completions)',
    endpoints.chatCompletions,
    'POST',
    chatData,
    headers
  );
  results.tests.push({ name: 'Chat Completions', ...chatResult });
  if (chatResult.success) results.passed++; else results.failed++;

  // 检查返回格式
  if (chatResult.success && chatResult.data) {
    const hasCorrectFormat =
      chatResult.data.id &&
      chatResult.data.object === 'chat.completion' &&
      chatResult.data.choices &&
      Array.isArray(chatResult.data.choices) &&
      chatResult.data.usage;

    if (hasCorrectFormat) {
      log('返回格式完全符合 OpenAI 规范 ✓', 'success');
    } else {
      log('返回格式部分符合 OpenAI 规范', 'warn');
      if (!chatResult.data.id) log('  - 缺少 id 字段', 'warn');
      if (!chatResult.data.object) log('  - 缺少 object 字段', 'warn');
      if (!chatResult.data.choices) log('  - 缺少 choices 字段', 'warn');
      if (!chatResult.data.usage) log('  - 缺少 usage 字段', 'warn');
    }
  }

  console.log('');

  // 3. 测试 Embeddings 端点 (POST)
  const embedData = {
    model: model,
    input: ['Hello world']
  };

  const embedResult = await testEndpoint(
    'Embeddings 端点 (POST /embeddings)',
    endpoints.embeddings,
    'POST',
    embedData,
    headers
  );
  results.tests.push({ name: 'Embeddings', ...embedResult });
  if (embedResult.success) results.passed++; else results.failed++;

  // 检查返回格式
  if (embedResult.success && embedResult.data) {
    const hasCorrectFormat =
      embedResult.data.data &&
      Array.isArray(embedResult.data.data);

    if (hasCorrectFormat) {
      log('返回格式符合 OpenAI 规范 ✓', 'success');
    } else {
      log('返回格式不符合 OpenAI 规范', 'warn');
    }
  }

  console.log('');
  console.log(colorize('=' .repeat(50), 'cyan'));
  console.log(colorize(`测试结果: ${results.passed} 通过, ${results.failed} 失败`, results.failed === 0 ? 'green' : 'yellow'));
  console.log(colorize('=' .repeat(50), 'cyan'));

  // 兼容性评分
  const compatibility = Math.round((results.passed / (results.passed + results.failed)) * 100);
  let compatibilityLevel;

  if (compatibility >= 90) {
    compatibilityLevel = '高兼容性 ✓';
    console.log(colorize(`兼容性评分: ${compatibility}% - ${compatibilityLevel}`, 'green'));
  } else if (compatibility >= 70) {
    compatibilityLevel = '中等兼容性';
    console.log(colorize(`兼容性评分: ${compatibility}% - ${compatibilityLevel}`, 'yellow'));
  } else {
    compatibilityLevel = '低兼容性 ✗';
    console.log(colorize(`兼容性评分: ${compatibility}% - ${compatibilityLevel}`, 'red'));
  }

  console.log('');

  // 建议
  if (results.failed > 0) {
    log('可能的改进建议:', 'info');
    results.tests.filter(t => !t.success).forEach(t => {
      if (t.error) {
        console.log(`  - ${t.name}: 检查网络连接和 URL 格式`);
      } else {
        console.log(`  - ${t.name}: 检查 API 端点路径和认证方式`);
      }
    });
  }

  return results;
}

// 运行测试
runTests().catch(error => {
  console.error(colorize(`\n测试执行失败: ${error.message}`, 'red'));
  process.exit(1);
});
