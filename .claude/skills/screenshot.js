#!/usr/bin/env node

/**
 * Screenshot Skill
 * Usage: /screenshot [options]
 *
 * Options:
 *   --safe       Only save locally, don't upload to CDN
 *   --output     Custom output path
 *   --dingtalk   Send to DingTalk (requires configuration)
 */

import { ScreenshotCapture } from '../../../../mcp-screenshot/lib/screenshot.js';
import fs from 'fs';
import path from 'path';

export default async function screenshotSkill(args = []) {
  console.log('📸 Screenshot Skill\n');

  // Parse arguments
  const options = {
    safe: false,
    output: null,
    sendToDingTalk: false
  };

  for (const arg of args) {
    if (arg === '--safe') options.safe = true;
    if (arg.startsWith('--output=')) options.output = arg.replace('--output=', '');
    if (arg === '--dingtalk') options.sendToDingTalk = true;
  }

  try {
    // Capture screenshot
    const capture = new ScreenshotCapture({
      defaultSavePath: 'D:/temp/screenshots/',
      defaultFormat: 'png'
    });

    const captureOptions = {};
    if (options.output) {
      const dir = path.dirname(options.output);
      const filename = path.basename(options.output);
      captureOptions.savePath = dir;
      captureOptions.filename = filename;
    }

    const screenshot = await capture.capture(captureOptions);

    console.log('✅ Screenshot saved:\n');
    console.log(`   📁 Path: ${screenshot.path}`);
    console.log(`   📊 Size: ${screenshot.sizeKB}KB`);
    console.log(`   🕐 Time: ${screenshot.timestamp}\n`);

    // Show in file explorer (Windows only)
    if (process.platform === 'win32') {
      const { exec } = await import('child_process');
      exec(`explorer /select,"${screenshot.path}"`);
      console.log('📂 Opening file explorer...\n');
    }

    // Send to DingTalk if requested
    if (options.sendToDingTalk) {
      console.log('📤 Sending to DingTalk...\n');
      // TODO: Implement DingTalk sending
      console.log('⚠️  DingTalk sending requires configuration');
    }

    return {
      success: true,
      path: screenshot.path,
      size: screenshot.sizeKB
    };

  } catch (error) {
    console.error('❌ Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
