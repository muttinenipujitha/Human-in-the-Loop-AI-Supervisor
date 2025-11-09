Human-in-the-Loop AI Supervisor System
Developer — Pujitha Muttineni
 Overview

This project demonstrates a human-in-the-loop AI assistant designed to handle customer queries in a simulated salon environment.
It enables an AI receptionist to:

Respond automatically to known questions.

Escalate unknown queries to a human supervisor.

Follow up once the supervisor provides an answer.

Continuously improve by updating its knowledge base.

The system is built using FastAPI, LiveKit, gTTS, and SQLite, and runs fully on a local environment.

🧠 System Objective

The goal is to show how an AI agent can behave intelligently — not just by replying to fixed prompts, but by involving a human when necessary and learning from that feedback.
This aligns with Frontdesk’s vision of creating AI receptionists capable of independent and adaptive decision-making.

⚙️ Key Features
🗣️ Voice-Based Interaction

The user and AI communicate via LiveKit audio rooms.

The bot plays spoken responses using text-to-speech (gTTS).

🤖 AI Response Handling

Answers known questions directly from a stored knowledge base.

For unknown questions, informs the user: “Let me check with my supervisor and get back to you.”

👩‍💼 Supervisor Escalation

Each unknown query is logged as a pending help request.

A supervisor dashboard displays all open requests.

Supervisors can review and submit answers in real time.

 Continuous Learning

When a supervisor resolves a request, the system:

Follows up automatically with the user through TTS.

Updates the knowledge base with the new answer for future use.

⏱️ Timeout and Lifecycle Management

Requests that remain unanswered for a defined period are marked as unresolved.

The user receives a polite message indicating that supervisors are currently busy.

 System Architecture
[User Voice UI]  <--->  [LiveKit Room]  <--->  [AI Bot Publisher]
       |                                         |
       |-------------> [FastAPI Backend] <-------|
                              |
                        [SQLite Database]
                              |
               ├── help_requests (Pending / Resolved)
               └── kb (Knowledge Base)

Components
Component	Description
FastAPI Backend	Handles calls, knowledge base queries, escalation logic, and text-to-speech generation.
LiveKit	Enables voice streaming between the user and AI bot.
gTTS	Converts text responses into audio files served through /static/tts/.
SQLite	Stores conversation history, pending requests, and learned answers.
Voice UI	Simulates a customer interacting with the AI receptionist.
Bot Publisher	Joins the LiveKit room as the AI bot and plays audio responses.
Supervisor Dashboard	Allows human supervisors to view, answer, and track pending help requests.
 Database Design
help_requests
Field	Description
id	Unique request ID
caller_id	Simulated caller identifier
caller_name	Name of the caller
question	The customer’s question
supervisor_answer	Response provided by the supervisor
status	pending, resolved, or unresolved
created_at	Timestamp of request creation
kb
Field	Description
id	Knowledge base entry ID
question_variant	The original question text
canonical_question	Processed version of the question
answer	AI response
source_request_id	Link to the help request that taught the AI
 Tech Stack
Layer	Tools / Frameworks
Frontend	HTML, JavaScript
Backend	FastAPI (Python)
Database	SQLite
Voice Processing	LiveKit, gTTS
Environment	Localhost (Uvicorn server)
 How to Run
1. Install dependencies
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
pip install websockets

2. Configure environment

Create a .env file:

LIVEKIT_URL=https://your-livekit-domain.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

3. Start the backend
uvicorn main:app --host 127.0.0.1 --port 8000

4. Open in browser
Page	URL	Purpose
Supervisor Dashboard	http://127.0.0.1:8000/
	Manage help requests
Bot Publisher	http://127.0.0.1:8000/static/bot_publisher.html
	Joins room as AI bot
Voice Demo	http://127.0.0.1:8000/static/voice.html
	Simulates a user call
 Demo Flow

User joins the LiveKit room and asks a question.

AI bot responds if the answer exists in its knowledge base.

If the AI doesn’t know, it politely escalates the query to a supervisor.

Supervisor reviews the pending request on the dashboard and submits an answer.

AI follows up with the user automatically and stores the new answer.

On repeating the same question, the AI now responds instantly.

📈 Design Decisions

Modular structure: Separate logic for calls, bot handling, and supervisor interaction.

Lightweight persistence: Used SQLite for simplicity and portability.

Async communication: LiveKit for real-time audio, WebSocket for updates.

Self-learning mechanism: Dynamic KB updates make the agent smarter after each resolved query.

 Future Improvements (Phase 2 Plan)

If this system were extended further, it could support live supervisor escalation.
In such a setup:

The AI detects available supervisors in real time.

The user is offered a live call transfer to the supervisor via the same LiveKit room.

If no one is available, the system falls back to asynchronous escalation (current workflow).

These enhancements would make the AI capable of both real-time and deferred human-in-the-loop handling.

 Learning Outcomes

Through this project, I strengthened my ability to:

Design modular full-stack systems.

Integrate real-time communication APIs (LiveKit).

Work with asynchronous event handling and WebSockets.

Implement AI learning loops from human supervision.

Build error-resilient backend logic with clean database design.

 Demo Summary

The demonstration shows:

AI handling known queries through stored responses.

Escalation and supervisor resolution for unknown questions.

Automated follow-up by AI and KB update.

Re-query returning instant learned response.

This satisfies all deliverables for Phase 1 of the assignment.

 Conclusion

This implementation captures the foundation of a smart AI receptionist that not only responds to users but also learns dynamically through human feedback.
The design is scalable, modular, and easy to extend toward live human transfer scenarios in future phases.
