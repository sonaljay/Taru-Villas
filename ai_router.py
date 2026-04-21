import sys
import subprocess

def run_gemma(prompt):
    result = subprocess.run(
        ["ollama", "run", "gemma:7b"],
        input=prompt,
        text=True,
        capture_output=True
    )
    return result.stdout

def run_claude(prompt):
    result = subprocess.run(
        ["claude", prompt],
        text=True,
        capture_output=True
    )
    return result.stdout

def auto_route(prompt):
    keywords = ["debug", "error", "fail", "architecture", "design"]

    if any(k in prompt.lower() for k in keywords):
        print("[ROUTER] → CLAUDE\n")
        return run_claude(prompt)
    else:
        print("[ROUTER] → GEMMA\n")
        return run_gemma(prompt)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 ai_router.py [gemma|claude|auto] 'your prompt'")
        sys.exit(1)

    mode = sys.argv[1]
    prompt = " ".join(sys.argv[2:])

    if mode == "gemma":
        print(run_gemma(prompt))
    elif mode == "claude":
        print(run_claude(prompt))
    elif mode == "auto":
        print(auto_route(prompt))
    else:
        print("Invalid mode")

