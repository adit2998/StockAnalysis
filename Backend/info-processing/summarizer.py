from dotenv import load_dotenv
from litellm import completion
import os

load_dotenv()

text_to_summarize = """
Item 2. Properties our headquarters is in santa clara, california. We own and lease approximately 3 million square feet of office and building space for our corporate headquarters. In addition, we lease data center space in santa clara, california. We also own and lease facilities for data centers, research and development, and/or sales and administrative purposes throughout the u.s. And in various international locations, primarily in china, india, israel, and taiwan. We believe our existing facilities, both owned and leased, are in good condition and suitable for the conduct of our business. We do not identify or allocate assets by operating segment. For additional information regarding obligations under leases, refer to note 17 of the notes to the consolidated financial statements in part iv, item 15 of this annual report on form 10-k, which information is hereby incorporated by reference.
"""

response = completion(
    model="claude-sonnet-4-6",
    api_key=os.getenv("ANTHROPIC_API_KEY"),  # pass it explicitly
    messages=[
        {
            "role": "user",
            "content": f"Please summarize the following text:\n\n{text_to_summarize}"
        }
    ]
)

print(response.choices[0].message.content)