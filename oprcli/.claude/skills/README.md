# Claude Code Skills

## 📸 Available Skills

### /screenshot

Capture a screenshot of your screen.

**Usage**:
```
/screenshot [options]
```

**Options**:
- `--safe` - Only save locally, don't upload to CDN
- `--output=PATH` - Custom output path
- `--dingtalk` - Send to DingTalk (requires configuration)

**Examples**:
```
/screenshot                    # Capture with default settings
/screenshot --safe            # Capture locally only
/screenshot --output=D:/temp/my-screen.png
/screenshot --dingtalk        # Send to DingTalk
```

---

## 🛠️ Creating New Skills

1. Create a new JavaScript file in `.claude/skills/`
2. Export a default async function
3. Add a corresponding `.json` config file

**Example**:
```javascript
// .claude/skills/hello.js
export default async function helloSkill(args = []) {
  const name = args[0] || 'World';
  console.log(`Hello, ${name}!`);
  return { success: true, message: `Greeted ${name}` };
}
```

**Config**:
```json
{
  "name": "hello",
  "description": "Say hello to someone",
  "usage": "/hello [name]",
  "examples": ["/hello", "/hello Claude"]
}
```
