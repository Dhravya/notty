"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bot, Send, User } from "lucide-react";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SupermemoryChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteContent?: string;
}

export function SupermemoryChatDialog({
  open,
  onOpenChange,
  noteContent,
}: SupermemoryChatDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // TODO: Replace this with your Supermemory API integration
      // Example structure:
      // const response = await fetch('/api/supermemory/chat', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     messages: [...messages, userMessage],
      //     noteContext: noteContent,
      //   }),
      // });
      // const data = await response.json();

      // Placeholder response - replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const assistantMessage: Message = {
        role: "assistant",
        content:
          "This is a placeholder response. Please integrate your Supermemory API here to get real responses.",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, there was an error processing your request.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[600px] flex-col sm:max-w-[600px]">
        <DialogHeader className="text-center">
          <DialogTitle className="flex items-center justify-center gap-2">
            Ask Supermemory
          </DialogTitle>
        </DialogHeader>

        {/* Chat Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-stone-500 dark:text-stone-400">
              <Bot className="mb-4 h-12 w-12 opacity-50" />
              <p className="text-sm">Start a conversation with Supermemory</p>
              <p className="mt-2 text-xs">
                Ask questions about your notes or request information
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-stone-200 dark:bg-stone-800">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={`max-w-[70%] rounded-lg px-4 py-2 ${
                  message.role === "user"
                    ? "bg-stone-900 text-stone-50 dark:bg-stone-50 dark:text-stone-900"
                    : "bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-50"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{message.content}</p>
              </div>

              {message.role === "user" && (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-stone-900 dark:bg-stone-50">
                  <User className="h-4 w-4 text-stone-50 dark:text-stone-900" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-stone-200 dark:bg-stone-800">
                <Bot className="h-4 w-4" />
              </div>
              <div className="max-w-[70%] rounded-lg bg-stone-100 px-4 py-2 dark:bg-stone-800">
                <div className="flex gap-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-stone-400" />
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-stone-400"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-stone-400"
                    style={{ animationDelay: "0.4s" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="flex gap-2 border-t border-stone-200 pt-4 dark:border-stone-800">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask Supermemory anything..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={() => void handleSend()}
            disabled={!input.trim() || isLoading}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
