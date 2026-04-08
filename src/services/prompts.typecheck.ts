import type { PromptsService } from "./prompts.service.js";
import type { RawGetPromptResponse } from "./prompts.types.js";

type Assert<T extends true> = T;

type IsExact<T, U> =
	(<Value>() => Value extends T ? 1 : 2) extends <Value>() => Value extends U
		? 1
		: 2
		? (<Value>() => Value extends U ? 1 : 2) extends <
				Value,
			>() => Value extends T ? 1 : 2
			? true
			: false
		: false;

type GetPromptVersionReturn = Awaited<
	ReturnType<PromptsService["getPromptVersion"]>
>;

type _GetPromptVersionShouldUsePromptResponseType = Assert<
	IsExact<GetPromptVersionReturn, RawGetPromptResponse>
>;
