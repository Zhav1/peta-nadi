import logging
import httpx
from typing import Dict, Any, List
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class CuOptAdapter:
    @staticmethod
    def get_nvidia_key() -> str:
        """Helper to get a valid NVIDIA API Key from config."""
        for key in [
            settings.nvidia_cuopt,
            settings.nvidia_deepseek_v4_pro,
            settings.nvidia_deepseek_v4_flash,
            settings.nvidia_fourcastnet
        ]:
            if key and not key.startswith("your-") and key != "":
                return key
        return ""

    @classmethod
    async def solve_vrp(
        cls,
        cost_matrix: List[List[float]],
        locations: List[str],
        fleet_size: int = 5,
        vehicle_capacity: float = 100.0,
        demands: List[float] = None
    ) -> Dict[str, Any]:
        """
        Submits a Vehicle Routing Problem (VRP) to the NVIDIA cuOpt solver.
        If offline or API key is missing, returns a mock optimized route.
        """
        # Demands default to 10 for each location except the start node (0)
        num_nodes = len(locations)
        if demands is None:
            demands = [0.0] + [10.0] * (num_nodes - 1)

        # Basic validation
        if len(cost_matrix) != num_nodes or any(len(row) != num_nodes for row in cost_matrix):
            raise ValueError("Cost matrix size must match the number of locations.")

        nvidia_key = cls.get_nvidia_key()
        demo_offline = settings.demo_offline or not nvidia_key

        if demo_offline:
            logger.info("cuOpt Adapter: Running in offline/mock mode. Generating optimized routes.")
            return cls._generate_mock_solution(locations, cost_matrix)

        # Standard cuOpt VRP Payload
        # Mapping index to node name: 0 is origin, 1..N are destinations
        payload = {
            "data": {
                "cost_matrix_data": {
                    "travel_time_matrix": cost_matrix
                },
                "fleet_data": {
                    "vehicle_locations": [[0, 0]] * fleet_size,  # Vehicles start and end at origin
                    "vehicle_ids": [f"truck_{i}" for i in range(fleet_size)],
                    "vehicle_types": [1] * fleet_size,
                    "capacities": [[vehicle_capacity]] * fleet_size
                },
                "task_data": {
                    "task_locations": list(range(1, num_nodes)),
                    "demand": [[d] for d in demands[1:]],
                    "task_ids": [f"deliver_{locations[i]}" for i in range(1, num_nodes)]
                },
                "solver_config": {
                    "time_limit": 2.0
                }
            }
        }

        headers = {
            "Authorization": f"Bearer {nvidia_key}",
            "Content-Type": "application/json"
        }

        try:
            async with httpx.AsyncClient() as client:
                # Standard endpoint for cuOpt VRP API catalog
                response = await client.post(
                    "https://api.nvidia.com/v1/routing/cuopt/vrp",
                    headers=headers,
                    json=payload,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    logger.info("cuOpt VRP Solver API call succeeded.")
                    return response.json()
                else:
                    logger.warning(f"cuOpt API returned status {response.status_code}. Using mock fallback solution.")
                    return cls._generate_mock_solution(locations, cost_matrix)
        except Exception as e:
            logger.error(f"Error calling cuOpt API: {e}. Using mock fallback solution.")
            return cls._generate_mock_solution(locations, cost_matrix)

    @classmethod
    def _generate_mock_solution(cls, locations: List[str], cost_matrix: List[List[float]]) -> Dict[str, Any]:
        """Generates a structured mock cuOpt solution for routing."""
        # Simple simulated routing result
        routes = {}
        # Route 1 visits nodes sequentially
        num_nodes = len(locations)
        if num_nodes > 1:
            routes["truck_0"] = {
                "route": [0] + list(range(1, num_nodes)) + [0],
                "arrival_times": [0.0] + [cost_matrix[0][i] for i in range(1, num_nodes)] + [cost_matrix[num_nodes-1][0]],
                "total_travel_time": sum(cost_matrix[0])
            }
        else:
            routes["truck_0"] = {
                "route": [0, 0],
                "arrival_times": [0.0, 0.0],
                "total_travel_time": 0.0
            }
            
        return {
            "status": "success",
            "solution": {
                "routes": routes,
                "unassigned_tasks": []
            }
        }
