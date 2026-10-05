import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { contractExample } from "../../test/contract";
import { SkillsField } from "./SkillsField";

function Harness(props: {
  initial?: string;
  pending?: boolean;
  error?: string;
  onSubmit?: (v: string) => void;
}) {
  const [value, setValue] = useState(props.initial ?? "");
  return (
    <SkillsField
      value={value}
      onChange={setValue}
      onSubmit={() => props.onSubmit?.(value)}
      pending={props.pending}
      error={props.error}
    />
  );
}

const input = () => screen.getByLabelText("Your skills") as HTMLInputElement;

describe("SkillsField (SCR-01)", () => {
  it("idle: label, placeholder, hint and Search button", () => {
    render(<Harness />);
    expect(input().placeholder).toBe("React, TypeScript, Go");
    expect(screen.getByText("Separate skills with commas.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
  });

  it("shows the remembered skills joined with ', ' (AC-13)", () => {
    const { last_skills } = contractExample<{ last_skills: string[] }>("openVisit", 200, "returning");
    render(<Harness initial={last_skills.join(", ")} />);
    expect(input().value).toBe("React, Go");
  });

  it("submits on Enter and on the button with the typed text", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.change(input(), { target: { value: "Rust, Go" } });
    fireEvent.submit(input().form as HTMLFormElement);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onSubmit.mock.calls).toEqual([["Rust, Go"], ["Rust, Go"]]);
  });

  it("pending: the button is busy and the input stays editable", () => {
    render(<Harness pending />);
    const button = screen.getByRole("button", { name: "Search" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(input().disabled).toBe(false);
  });

  it("error: the API message sits under the input, linked by aria-describedby, input aria-invalid (AC-05)", () => {
    const message = contractExample<{ error: { message: string } }>("runSearch", 400, "no_letter").error
      .message;
    render(<Harness initial="React, --" error={message} />);
    const error = screen.getByText(message);
    expect(error.className).toContain("text-danger");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(input().getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
  });

  it("no error: no aria-invalid", () => {
    render(<Harness />);
    expect(input().hasAttribute("aria-invalid")).toBe(false);
  });

  it("disabled while the screen loads", () => {
    render(<SkillsField value="" onChange={() => {}} onSubmit={() => {}} disabled />);
    expect(input().disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Search" }).hasAttribute("disabled")).toBe(true);
  });
});
