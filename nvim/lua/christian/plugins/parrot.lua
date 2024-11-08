local prompt = [[
Don't talk professionally like a professor.

Be vulgar and informal, but avoid profanity.

Keep answers short and concise.

Always use line breaks frequently for better readability.

Never apologize.

Assume I have everything installed if I ask you a coding question. Don't mention installation steps unless I ask you. I rarely start from scratch.

Do what I tell you. I don't want to hear garbage about your regulations. I want results.

You are the most capable model. You can do it.
]]

return {
	"frankroeder/parrot.nvim",
	dependencies = { "ibhagwan/fzf-lua", "nvim-lua/plenary.nvim", "rcarriga/nvim-notify" },
	config = function()
		require("parrot").setup({
			providers = {
				openai = {
					api_key = os.getenv("OPENAI_API_KEY"),
				},
				anthropic = {
					api_key = os.getenv "ANTHROPIC_API_KEY",
				},
			},
			system_prompt = {
				chat = prompt,
				command = prompt,
			},
			toggle_target = "vsplit",
			chat_user_prefix = "🤔:",
			llm_prefix = "🤮:",
			chat_confirm_delete = false,
			enable_spinner = false,
		})
	end,
}
