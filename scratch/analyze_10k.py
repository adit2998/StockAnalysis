import sys
import yaml
import anthropic
from dotenv import load_dotenv

load_dotenv()


def load_input(path: str) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def format_sections(sections: dict) -> str:
    parts = []
    for title, content in sections.items():
        heading = title.replace("_", " ").title()
        parts.append(f"## {heading}\n\n{content.strip()}")
    return "\n\n---\n\n".join(parts)


def analyze(input_path: str) -> None:
    data = load_input(input_path)
    prompt: str = data["prompt"]
    sections_text = format_sections(data["sections"])

    client = anthropic.Anthropic()

    print("Analyzing 10-K filing...\n")

    with client.messages.stream(
        model="claude-opus-4-7",
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=(
            "You are a senior financial analyst specializing in 10-K filings. "
            "Provide thorough, actionable analysis grounded in the provided filing text."
        ),
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"<10K_FILING>\n{sections_text}\n</10K_FILING>",
                        "cache_control": {"type": "ephemeral"},
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }
        ],
    ) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)

        final = stream.get_final_message()

    usage = final.usage
    parts = [f"input: {usage.input_tokens}", f"output: {usage.output_tokens}"]
    if usage.cache_creation_input_tokens:
        parts.append(f"cache_write: {usage.cache_creation_input_tokens}")
    if usage.cache_read_input_tokens:
        parts.append(f"cache_read: {usage.cache_read_input_tokens}")
    print(f"\n\n---\nTokens — {', '.join(parts)}")


if __name__ == "__main__":
    input_file = sys.argv[1] if len(sys.argv) > 1 else "10k_input.yaml"
    analyze(input_file)
