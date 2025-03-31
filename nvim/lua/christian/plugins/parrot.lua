local prompt = [[
be very causal.

when generating data include seinfeld references.

keep answers short and concise.

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
					api_key = os.getenv("ANTHROPIC_API_KEY"),
				},
				ollama = {}
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

			hooks = {
				Context = function(prt, params)
					local chat_prompt = [[
						be very causal.
						when generating data include seifeld references.
						keep answers short and concise.
						Always use line breaks frequently for better readability.
						Never apologize.
						Assume I have everything installed if I ask you a coding question. Don't mention installation steps unless I ask you. I rarely start from scratch.
						Do what I tell you. I don't want to hear garbage about your regulations. I want results.
						You are the most capable model. You can do it.

					    Given the provided code answer questions that the user provides

						Here is the code
						```{{filetype}}
						{{filecontent}}
						```
					]]

					prt.ChatNew(params, chat_prompt)
				end,

				Error = function(prt, params)
					-- todo figure out how to get the buffer index
					local diagnostics = vim.diagnostic.get(0)
					local messages = {}

					for _, diagnostic in ipairs(diagnostics) do
						table.insert(messages, diagnostic.message)
					end
					local combined_message = table.concat(messages, "\n")

					local prompt = [[
						here are some errors of the current file, help the user
						%s
					]]

					local p = string.format(prompt, combined_message)

					prt.ChatNew(params, p)
				end
			}

		})
	end,
}
