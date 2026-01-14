import { describe, expect, test } from "bun:test"
import path from "path"
import { Session } from "../../../src/session"
import { Log } from "../../../src/util/log"
import { Instance } from "../../../src/project/instance"
import { Server } from "../../../src/server/server"
import { Question } from "../../../src/question"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

const questions: Question.AskInput["questions"] = [
  {
    question: "What is your name?",
    header: "Name",
    options: [
      { description: "Julian", label: "Julian (the best name)" },
      { description: "Other", label: "Other" },
    ],
  },
]

describe("question.ask endpoint", () => {
  test("should return simple ID when asked a question", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        const session = await Session.create({})
        const app = Server.App()

        // #when
        const ask = await app.request("/question/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionID: session.id, questions } satisfies Question.AskInput),
        })
        const responses = await app.request(`/question`, { method: "GET" })

        // #then
        expect(ask.status).toBe(200)
        const { id } = await ask.json()
        expect(id).toMatch(/^que_/)

        expect(responses.status).toBe(200)
        const [response] = await responses.json()
        expect(response).toMatchObject({ id, questions, sessionID: expect.stringMatching(/^ses_/) })

        await Session.remove(session.id)
      },
    })
  })

  test("should return 404 when session does not exist", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        const nonExistentSessionID = "ses_nonexistent123"

        // #when
        const app = Server.App()
        const response = await app.request("/question/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionID: nonExistentSessionID, questions }),
        })

        // #then
        expect(response.status).toBe(404)
      },
    })
  })

  test("should return 400 when session ID format is invalid", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        const invalidSessionID = "invalid_session_id"

        // #when
        const app = Server.App()
        const response = await app.request("/question/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionID: invalidSessionID, questions }),
        })

        // #then
        expect(response.status).toBe(400)
      },
    })
  })
})
