from __future__ import annotations

from app.agents.base import BaseAgent
from app.agents.director import DirectorAgent
from app.agents.finance import FinanceAgent
from app.agents.marketing import MarketingAgent
from app.agents.ops import OpsAgent
from app.agents.product_dev import ProductDevAgent
from app.agents.sales import SalesAgent
from app.agents.support import SupportAgent

AGENTS: dict[str, type[BaseAgent]] = {
    "ops": OpsAgent,
    "director": DirectorAgent,
    "product_dev": ProductDevAgent,
    "support": SupportAgent,
    "marketing": MarketingAgent,
    "sales": SalesAgent,
    "finance": FinanceAgent,
}
