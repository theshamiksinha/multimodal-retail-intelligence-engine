import os
import json
from typing import Annotated, TypedDict
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_mistralai import ChatMistralAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

from app.services import sales_service, video_service


class AdvisorState(TypedDict):
    messages: Annotated[list, add_messages]
    context: str
    tools_output: str


# Session memory for conversation history
conversation_sessions: dict[str, list] = {}


# Replace get_llm():
def get_llm():
    return ChatMistralAI(
        model="mistral-large-latest",
        temperature=0.7,
        api_key=os.getenv("MISTRAL_API_KEY"),
    )


def gather_context(state: AdvisorState) -> AdvisorState:
    """Gather all available data context for the advisor."""
    context_parts = []

    # Sales & inventory context
    try:
        sales_context = sales_service.get_context_for_advisor()
        context_parts.append(sales_context)
    except Exception as e:
        context_parts.append(f"Sales data unavailable: {e}")

    # Vision analytics context
    try:
        # Check for demo or any active session
        session = video_service.get_session("demo")
        if session is None:
            video_service.generate_sample_analytics()
            session = video_service.get_session("demo")

        if session:
            context_parts.append("\n=== IN-STORE ANALYTICS ===")
            context_parts.append(f"Total Customers Detected: {session['total_people']}")
            context_parts.append(f"Frames Analyzed: {session['frame_count']}")
            context_parts.append("\nStore Zones:")
            for zone in session["zones"]:
                context_parts.append(
                    f"  - {zone['name']}: {zone['level']} (score: {zone['density_score']})"
                    f" — {zone['description']}"
                )
            context_parts.append("\nAverage Dwell Times:")
            for dt in session["dwell_times"]:
                context_parts.append(f"  - {dt['zone']}: {dt['avg_dwell_seconds']}s")
    except Exception as e:
        context_parts.append(f"Vision analytics unavailable: {e}")

    state["context"] = "\n".join(context_parts)
    return state


def advisor_respond(state: AdvisorState) -> AdvisorState:
    """Generate advisor response using LLM with full context."""
    llm = get_llm()

    system_prompt = f"""You are an AI Retail Advisor for a small/medium retail store. You have access to the store's
sales data, inventory status, and in-store customer behaviour analytics from CCTV analysis.

Your role is to:
1. Answer questions about store performance, customer behaviour, and inventory
2. Provide actionable recommendations for store layout, product placement, and marketing
3. Suggest marketing campaigns based on current data
4. Alert about issues like expiring stock, low inventory, or underperforming areas
5. Help store owners make data-driven decisions

Always be specific and reference actual data when making recommendations.
Be conversational, helpful, and practical. These are small store owners, not data scientists.

=== CURRENT STORE DATA ===
{state['context']}
"""

    messages = [SystemMessage(content=system_prompt)] + state["messages"]
    response = llm.invoke(messages)
    state["messages"] = [response]
    return state


def build_advisor_graph():
    """Build the LangGraph advisor workflow."""
    graph = StateGraph(AdvisorState)
    graph.add_node("gather_context", gather_context)
    graph.add_node("respond", advisor_respond)

    graph.add_edge(START, "gather_context")
    graph.add_edge("gather_context", "respond")
    graph.add_edge("respond", END)

    return graph.compile()


# Compiled graph (singleton)
_advisor_graph = None


def get_advisor():
    global _advisor_graph
    if _advisor_graph is None:
        _advisor_graph = build_advisor_graph()
    return _advisor_graph


def chat(message: str, session_id: str = "default") -> dict:
    """Handle a chat message from the user."""
    advisor = get_advisor()

    # Get conversation history
    if session_id not in conversation_sessions:
        conversation_sessions[session_id] = []

    history = conversation_sessions[session_id]
    history.append(HumanMessage(content=message))

    # Run the graph
    result = advisor.invoke({
        "messages": history,
        "context": "",
        "tools_output": "",
    })

    # Extract the AI response
    ai_messages = [m for m in result["messages"] if isinstance(m, AIMessage)]
    if ai_messages:
        response_text = ai_messages[-1].content
    else:
        response_text = "I'm sorry, I couldn't generate a response. Please try again."

    # Update history
    history.append(AIMessage(content=response_text))
    # Keep history manageable
    if len(history) > 20:
        history = history[-20:]
    conversation_sessions[session_id] = history

    # Generate suggestions
    suggestions = generate_follow_up_suggestions(message, response_text)

    return {
        "response": response_text,
        "suggestions": suggestions,
        "data_references": [],
    }


def generate_follow_up_suggestions(question: str, answer: str) -> list[str]:
    """Generate contextual follow-up suggestions."""
    suggestions = []
    q_lower = question.lower()

    if any(w in q_lower for w in ["heatmap", "traffic", "zone", "area", "layout"]):
        suggestions = [
            "How should I rearrange my store layout?",
            "Which products should I place in high-traffic areas?",
            "Generate a promotion for the low-traffic zone",
        ]
    elif any(w in q_lower for w in ["sale", "revenue", "profit", "selling"]):
        suggestions = [
            "What are my slowest-moving products?",
            "Create a clearance campaign for slow movers",
            "Show me weekly revenue trends",
        ]
    elif any(w in q_lower for w in ["inventory", "stock", "expir"]):
        suggestions = [
            "Which products are expiring soon?",
            "Generate a flash sale for expiring items",
            "What should I reorder this week?",
        ]
    elif any(w in q_lower for w in ["market", "campaign", "ad", "promot"]):
        suggestions = [
            "Create a social media campaign for top sellers",
            "What platform should I focus on?",
            "Generate a seasonal promotion",
        ]
    else:
        suggestions = [
            "Show me my store analytics overview",
            "Which areas of my store are being overlooked?",
            "Generate a campaign for my top products",
        ]

    return suggestions
