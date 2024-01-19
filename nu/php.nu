alias art = dcx php php artisan

alias amfs = art migrate:fresh --seed
alias asd = art db:seed
alias amm = art make:migration

alias punit = dcx php ./vendor/bin/phpunit
alias punitf = punit --filter
alias punitsof = punit --stop-on-failure

alias p = dcx php vendor/bin/pest 
alias pf = p --filter
alias psof = p --stop-on-failure
alias it = pf

