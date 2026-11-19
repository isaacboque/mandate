# Where does the amendment-chain walk live?

Status: resolved

`src/mandate/chain.ts` (`ancestry`), pure and cycle-safe; the service counts spend over it.
